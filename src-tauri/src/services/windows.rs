//! Windows window enumeration and management service

use serde::Serialize;
use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

#[cfg(windows)]
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, MAX_PATH};
#[cfg(windows)]
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetWindowLongPtrW, GetWindowTextLengthW, GetWindowTextW,
    GetWindowThreadProcessId, IsIconic, IsWindowVisible, SetForegroundWindow, ShowWindow,
    GWL_EXSTYLE, GWL_STYLE, SW_RESTORE, WS_EX_TOOLWINDOW, WS_VISIBLE,
};

const CACHE_DURATION_MS: u64 = 500;

/// Information about a running window
#[derive(Serialize, Clone, Debug)]
pub struct WindowInfo {
    pub hwnd: isize,
    pub title: String,
    pub process_name: String,
    pub process_path: String,
    pub is_minimized: bool,
}

/// List of running windows
#[derive(Serialize, Clone, Debug, Default)]
pub struct WindowList {
    pub windows: Vec<WindowInfo>,
}

// Cache for window list
static WINDOW_CACHE: OnceLock<Mutex<WindowCache>> = OnceLock::new();

struct WindowCache {
    data: WindowList,
    last_update: Option<Instant>,
}

impl Default for WindowCache {
    fn default() -> Self {
        Self {
            data: WindowList::default(),
            last_update: None,
        }
    }
}

fn get_cache() -> &'static Mutex<WindowCache> {
    WINDOW_CACHE.get_or_init(|| Mutex::new(WindowCache::default()))
}

#[cfg(windows)]
fn get_window_text(hwnd: HWND) -> String {
    unsafe {
        let len = GetWindowTextLengthW(hwnd);
        if len == 0 {
            return String::new();
        }
        let mut buffer: Vec<u16> = vec![0; (len + 1) as usize];
        let copied = GetWindowTextW(hwnd, &mut buffer);
        if copied == 0 {
            return String::new();
        }
        String::from_utf16_lossy(&buffer[..copied as usize])
    }
}

#[cfg(windows)]
fn get_class_name(hwnd: HWND) -> String {
    unsafe {
        let mut buffer: Vec<u16> = vec![0; 256];
        let len = GetClassNameW(hwnd, &mut buffer);
        if len == 0 {
            return String::new();
        }
        String::from_utf16_lossy(&buffer[..len as usize])
    }
}

#[cfg(windows)]
fn get_process_path(pid: u32) -> Option<PathBuf> {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buffer: Vec<u16> = vec![0; MAX_PATH as usize];
        let mut size = buffer.len() as u32;

        if QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(buffer.as_mut_ptr()),
            &mut size,
        )
        .is_ok()
        {
            let _ = windows::Win32::Foundation::CloseHandle(handle);
            let path = OsString::from_wide(&buffer[..size as usize]);
            return Some(PathBuf::from(path));
        }
        let _ = windows::Win32::Foundation::CloseHandle(handle);
        None
    }
}

#[cfg(windows)]
fn is_alt_tab_window(hwnd: HWND) -> bool {
    unsafe {
        // Must be visible
        if !IsWindowVisible(hwnd).as_bool() {
            return false;
        }

        // Get window styles
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;

        // Skip if not a visible window
        if (style & WS_VISIBLE.0) == 0 {
            return false;
        }

        // Skip tool windows (floating toolbars, etc.)
        if (ex_style & WS_EX_TOOLWINDOW.0) != 0 {
            return false;
        }

        // Skip windows without title
        let title = get_window_text(hwnd);
        if title.is_empty() {
            return false;
        }

        // Skip our own taskbar and popups
        if title == "bar-minimal-tools" || title.ends_with("-popup") {
            return false;
        }

        // Skip known system windows
        let class_name = get_class_name(hwnd);
        let skip_classes = [
            "Progman",
            "Shell_TrayWnd",
            "Windows.UI.Core.CoreWindow",
            "ApplicationFrameWindow",
            "Shell_SecondaryTrayWnd",
            "NotifyIconOverflowWindow",
            "TopLevelWindowForOverflowXamlIsland",
        ];

        if skip_classes.iter().any(|&c| class_name == c) {
            return false;
        }

        // Skip UWP frames that don't have visible content
        if class_name == "ApplicationFrameWindow" {
            // These are UWP container windows - we'd need to check child windows
            // For simplicity, we'll skip them if they have no useful title
            if title == "ApplicationFrameWindow" {
                return false;
            }
        }

        true
    }
}

#[cfg(windows)]
unsafe extern "system" fn enum_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    if !is_alt_tab_window(hwnd) {
        return BOOL(1); // Continue enumeration
    }

    let windows = &mut *(lparam.0 as *mut Vec<WindowInfo>);

    let title = get_window_text(hwnd);
    let is_minimized = IsIconic(hwnd).as_bool();

    // Get process ID
    let mut pid: u32 = 0;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));

    // Get process path and name
    let (process_path, process_name) = if let Some(path) = get_process_path(pid) {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        (path.to_string_lossy().to_string(), name)
    } else {
        (String::new(), String::new())
    };

    windows.push(WindowInfo {
        hwnd: hwnd.0 as isize,
        title,
        process_name,
        process_path,
        is_minimized,
    });

    BOOL(1) // Continue enumeration
}

/// Get list of all visible windows (Alt+Tab style)
pub fn get_window_list() -> WindowList {
    // Check cache
    {
        if let Ok(guard) = get_cache().lock() {
            if let Some(last_update) = guard.last_update {
                if last_update.elapsed() < Duration::from_millis(CACHE_DURATION_MS) {
                    return guard.data.clone();
                }
            }
        }
    }

    // Fetch new data
    let data = fetch_window_list();

    // Update cache
    if let Ok(mut guard) = get_cache().lock() {
        guard.data = data.clone();
        guard.last_update = Some(Instant::now());
    }

    data
}

#[cfg(windows)]
fn fetch_window_list() -> WindowList {
    let mut windows: Vec<WindowInfo> = Vec::new();

    unsafe {
        let _ = EnumWindows(
            Some(enum_windows_callback),
            LPARAM(&mut windows as *mut Vec<WindowInfo> as isize),
        );
    }

    WindowList { windows }
}

#[cfg(not(windows))]
fn fetch_window_list() -> WindowList {
    WindowList::default()
}

/// Bring a window to foreground
pub fn focus_window(hwnd: isize) -> Result<(), String> {
    #[cfg(windows)]
    {
        unsafe {
            let handle = HWND(hwnd as *mut std::ffi::c_void);

            // If minimized, restore it first
            if IsIconic(handle).as_bool() {
                let _ = ShowWindow(handle, SW_RESTORE);
            }

            // Bring to foreground
            if SetForegroundWindow(handle).as_bool() {
                Ok(())
            } else {
                Err("Failed to set foreground window".to_string())
            }
        }
    }

    #[cfg(not(windows))]
    {
        let _ = hwnd;
        Err("Window focus is only supported on Windows".to_string())
    }
}

/// Get the currently focused (foreground) window
pub fn get_foreground_window() -> Option<WindowInfo> {
    #[cfg(windows)]
    {
        use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() {
                return None;
            }

            // Check if it's an alt-tab worthy window
            if !is_alt_tab_window(hwnd) {
                return None;
            }

            let title = get_window_text(hwnd);
            let is_minimized = IsIconic(hwnd).as_bool();

            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));

            let (process_path, process_name) = if let Some(path) = get_process_path(pid) {
                let name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                (path.to_string_lossy().to_string(), name)
            } else {
                (String::new(), String::new())
            };

            Some(WindowInfo {
                hwnd: hwnd.0 as isize,
                title,
                process_name,
                process_path,
                is_minimized,
            })
        }
    }

    #[cfg(not(windows))]
    {
        None
    }
}

/// Get icon data for a process (base64 encoded PNG)
pub fn get_process_icon(process_path: &str) -> Option<String> {
    #[cfg(windows)]
    {
        use windows::Win32::Graphics::Gdi::{
            CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, SelectObject, BITMAPINFO,
            BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
        };
        use windows::Win32::UI::Shell::ExtractIconExW;
        use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, ICONINFO};

        if process_path.is_empty() {
            return None;
        }

        unsafe {
            // Extract icon from exe
            let wide_path: Vec<u16> = process_path
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();
            let mut large_icon = windows::Win32::UI::WindowsAndMessaging::HICON::default();

            let count = ExtractIconExW(
                windows::core::PCWSTR(wide_path.as_ptr()),
                0,
                Some(&mut large_icon),
                None,
                1,
            );

            if count == 0 || large_icon.is_invalid() {
                return None;
            }

            // Get icon info
            let mut icon_info = ICONINFO::default();
            if GetIconInfo(large_icon, &mut icon_info).is_err() {
                let _ = DestroyIcon(large_icon);
                return None;
            }

            // Get bitmap dimensions
            let hdc = CreateCompatibleDC(None);
            if hdc.is_invalid() {
                if !icon_info.hbmColor.is_invalid() {
                    let _ = DeleteObject(icon_info.hbmColor);
                }
                if !icon_info.hbmMask.is_invalid() {
                    let _ = DeleteObject(icon_info.hbmMask);
                }
                let _ = DestroyIcon(large_icon);
                return None;
            }

            let old_bitmap = SelectObject(hdc, icon_info.hbmColor);

            // Set up BITMAPINFO for 32-bit RGBA
            let mut bmi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: 32,
                    biHeight: -32, // Top-down
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    biSizeImage: 0,
                    biXPelsPerMeter: 0,
                    biYPelsPerMeter: 0,
                    biClrUsed: 0,
                    biClrImportant: 0,
                },
                bmiColors: [windows::Win32::Graphics::Gdi::RGBQUAD::default()],
            };

            let mut pixels: Vec<u8> = vec![0; 32 * 32 * 4];

            let result = GetDIBits(
                hdc,
                icon_info.hbmColor,
                0,
                32,
                Some(pixels.as_mut_ptr() as *mut _),
                &mut bmi,
                DIB_RGB_COLORS,
            );

            let _ = SelectObject(hdc, old_bitmap);
            let _ = DeleteDC(hdc);
            if !icon_info.hbmColor.is_invalid() {
                let _ = DeleteObject(icon_info.hbmColor);
            }
            if !icon_info.hbmMask.is_invalid() {
                let _ = DeleteObject(icon_info.hbmMask);
            }
            let _ = DestroyIcon(large_icon);

            if result == 0 {
                return None;
            }

            // Convert BGRA to RGBA
            for chunk in pixels.chunks_exact_mut(4) {
                chunk.swap(0, 2);
            }

            // Encode as PNG
            let mut png_data: Vec<u8> = Vec::new();
            {
                let mut encoder = png::Encoder::new(&mut png_data, 32, 32);
                encoder.set_color(png::ColorType::Rgba);
                encoder.set_depth(png::BitDepth::Eight);

                if let Ok(mut writer) = encoder.write_header() {
                    if writer.write_image_data(&pixels).is_err() {
                        return None;
                    }
                } else {
                    return None;
                }
            }

            use base64::Engine;
            let base64_str = base64::engine::general_purpose::STANDARD.encode(&png_data);
            return Some(format!("data:image/png;base64,{}", base64_str));
        }
    }

    #[cfg(not(windows))]
    {
        let _ = process_path;
        None
    }
}
