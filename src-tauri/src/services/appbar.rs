//! Windows AppBar service for docking the taskbar and reserving screen space

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

static APPBAR_REGISTERED: AtomicBool = AtomicBool::new(false);
// SHAppBarMessage/ABM_* calls can be timing-sensitive and must not interleave across threads.
static APPBAR_LOCK: Mutex<()> = Mutex::new(());

#[cfg(windows)]
pub mod windows_appbar {
    use super::*;
    use windows::Win32::Foundation::{HWND, LPARAM, RECT};
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::System::Threading::GetCurrentProcessId;
    use windows::Win32::UI::Shell::{
        SHAppBarMessage, ABE_TOP, ABM_NEW, ABM_QUERYPOS, ABM_REMOVE, ABM_SETPOS, APPBARDATA,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowLongW, GetWindowPlacement, GetWindowRect,
        GetWindowThreadProcessId, IsWindowVisible, SetWindowLongW, SetWindowPos, GWL_EXSTYLE,
        HWND_TOPMOST, SWP_NOACTIVATE, SWP_SHOWWINDOW, SW_SHOWMINIMIZED, WINDOWPLACEMENT, WM_USER,
        WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
    };

    const APPBAR_CALLBACK: u32 = WM_USER + 1;

    fn verbose_logs_enabled() -> bool {
        std::env::var_os("BAR_VERBOSE_LOGS").is_some()
    }

    /// Unregister helper that assumes APPBAR_LOCK is already held.
    unsafe fn unregister_appbar_inner(hwnd: HWND) {
        let was_registered = APPBAR_REGISTERED.load(Ordering::SeqCst);
        let mut abd = APPBARDATA {
            cbSize: std::mem::size_of::<APPBARDATA>() as u32,
            hWnd: hwnd,
            uCallbackMessage: APPBAR_CALLBACK,
            uEdge: 0,
            rc: RECT::default(),
            lParam: LPARAM(0),
        };
        let remove_result = SHAppBarMessage(ABM_REMOVE, &mut abd);
        APPBAR_REGISTERED.store(false, Ordering::SeqCst);
        if verbose_logs_enabled() {
            eprintln!(
                "AppBar unregistered (flag_was_registered={}, ABM_REMOVE_result={})",
                was_registered, remove_result
            );
        }
    }

    /// Configure window styles for AppBar behavior
    fn setup_appbar_window_style(hwnd: HWND) {
        unsafe {
            // Get current extended style
            let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);

            // Add WS_EX_TOOLWINDOW (excludes from taskbar) and remove WS_EX_APPWINDOW
            let new_style = (ex_style | WS_EX_TOOLWINDOW.0 as i32) & !(WS_EX_APPWINDOW.0 as i32);
            SetWindowLongW(hwnd, GWL_EXSTYLE, new_style);
        }
    }

    /// Register the window as an AppBar to reserve screen space
    pub fn register_appbar(
        hwnd: isize,
        x: i32,
        y: i32,
        width: i32,
        height: i32,
    ) -> Result<(), String> {
        let _guard = APPBAR_LOCK
            .lock()
            .map_err(|_| "Failed to lock APPBAR_LOCK".to_string())?;

        unsafe {
            let hwnd = HWND(hwnd as *mut _);

            // If we think it's registered, remove first.
            if APPBAR_REGISTERED.load(Ordering::SeqCst) {
                if verbose_logs_enabled() {
                    eprintln!("AppBar already registered (flag=true), unregistering first...");
                }
                unregister_appbar_inner(hwnd);
                std::thread::sleep(std::time::Duration::from_millis(80));
            }

            // Setup window style for AppBar
            setup_appbar_window_style(hwnd);

            let mut abd = APPBARDATA {
                cbSize: std::mem::size_of::<APPBARDATA>() as u32,
                hWnd: hwnd,
                uCallbackMessage: APPBAR_CALLBACK,
                uEdge: ABE_TOP,
                rc: RECT {
                    left: x,
                    top: y,
                    right: x + width,
                    bottom: y + height,
                },
                lParam: LPARAM(0),
            };

            if verbose_logs_enabled() {
                eprintln!(
                    "Calling ABM_NEW with rect: left={}, top={}, right={}, bottom={}",
                    abd.rc.left, abd.rc.top, abd.rc.right, abd.rc.bottom
                );
            }

            // Register the appbar.
            // ABM_NEW can fail if Windows still considers the old AppBar alive (especially after ABM_REMOVE)
            // or if two threads interleave ABM_REMOVE/ABM_NEW. We serialize calls and also backoff+retry.
            let mut registered = false;
            let backoff_ms: [u64; 5] = [0, 80, 200, 400, 800];
            for (attempt, delay) in backoff_ms.iter().enumerate() {
                if *delay > 0 {
                    std::thread::sleep(std::time::Duration::from_millis(*delay));
                }
                let result = SHAppBarMessage(ABM_NEW, &mut abd);
                if result != 0 {
                    if attempt > 0 && verbose_logs_enabled() {
                        eprintln!("ABM_NEW succeeded on attempt {}", attempt + 1);
                    }
                    registered = true;
                    break;
                }

                if verbose_logs_enabled() {
                    eprintln!(
                        "ABM_NEW failed on attempt {} - forcing ABM_REMOVE and retrying",
                        attempt + 1
                    );
                }

                // Best-effort remove even if our flag is out of sync.
                let mut remove_abd = APPBARDATA {
                    cbSize: std::mem::size_of::<APPBARDATA>() as u32,
                    hWnd: hwnd,
                    uCallbackMessage: APPBAR_CALLBACK,
                    uEdge: 0,
                    rc: RECT::default(),
                    lParam: LPARAM(0),
                };
                let remove_result = SHAppBarMessage(ABM_REMOVE, &mut remove_abd);
                if verbose_logs_enabled() {
                    eprintln!("ABM_REMOVE (cleanup) result: {}", remove_result);
                }
                APPBAR_REGISTERED.store(false, Ordering::SeqCst);
            }

            if !registered {
                eprintln!("ABM_NEW failed after retries");
                return Err("Failed to register AppBar".to_string());
            }

            // Query the position (Windows may adjust it)
            abd.uEdge = ABE_TOP;
            SHAppBarMessage(ABM_QUERYPOS, &mut abd);
            if verbose_logs_enabled() {
                eprintln!(
                    "After ABM_QUERYPOS: left={}, top={}, right={}, bottom={}",
                    abd.rc.left, abd.rc.top, abd.rc.right, abd.rc.bottom
                );
            }

            // For top edge, adjust the bottom based on height
            abd.rc.bottom = abd.rc.top + height;

            // Set the final position - this reserves the screen space
            abd.uEdge = ABE_TOP;
            let setpos_result = SHAppBarMessage(ABM_SETPOS, &mut abd);
            if verbose_logs_enabled() {
                eprintln!("ABM_SETPOS result: {}", setpos_result);
            }

            // Now move the window to the reserved position
            let pos_result = SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                abd.rc.left,
                abd.rc.top,
                abd.rc.right - abd.rc.left,
                abd.rc.bottom - abd.rc.top,
                SWP_NOACTIVATE | SWP_SHOWWINDOW,
            );
            if verbose_logs_enabled() {
                eprintln!("SetWindowPos result: {:?}", pos_result);
            }

            APPBAR_REGISTERED.store(true, Ordering::SeqCst);

            if verbose_logs_enabled() {
                eprintln!(
                    "AppBar registered: x={}, y={}, w={}, h={}",
                    abd.rc.left,
                    abd.rc.top,
                    abd.rc.right - abd.rc.left,
                    abd.rc.bottom - abd.rc.top
                );
            }

            Ok(())
        }
    }

    /// Unregister the AppBar and release the reserved space
    pub fn unregister_appbar(hwnd: isize) -> Result<(), String> {
        if !APPBAR_REGISTERED.load(Ordering::SeqCst) {
            return Ok(());
        }

        let _guard = APPBAR_LOCK
            .lock()
            .map_err(|_| "Failed to lock APPBAR_LOCK".to_string())?;

        unsafe {
            let hwnd = HWND(hwnd as *mut _);
            unregister_appbar_inner(hwnd);
        }

        Ok(())
    }

    /// Update the AppBar position (call after moving/resizing)
    pub fn update_appbar_position(
        hwnd: isize,
        x: i32,
        y: i32,
        width: i32,
        height: i32,
    ) -> Result<(), String> {
        if !APPBAR_REGISTERED.load(Ordering::SeqCst) {
            return register_appbar(hwnd, x, y, width, height);
        }

        // Keep this update path resilient: in some Windows timing states, ABM_SETPOS can fail
        // and the reserved work area (“gap/overlay”) won’t update until we re-register.
        let updated_ok = {
            let _guard = APPBAR_LOCK
                .lock()
                .map_err(|_| "Failed to lock APPBAR_LOCK".to_string())?;

            unsafe {
                let hwnd = HWND(hwnd as *mut _);

                let mut abd = APPBARDATA {
                    cbSize: std::mem::size_of::<APPBARDATA>() as u32,
                    hWnd: hwnd,
                    uCallbackMessage: APPBAR_CALLBACK,
                    uEdge: ABE_TOP,
                    rc: RECT {
                        left: x,
                        top: y,
                        right: x + width,
                        bottom: y + height,
                    },
                    lParam: LPARAM(0),
                };

                // Query and set the new position
                SHAppBarMessage(ABM_QUERYPOS, &mut abd);
                abd.rc.bottom = abd.rc.top + height;
                let setpos_result = SHAppBarMessage(ABM_SETPOS, &mut abd);
                if setpos_result == 0 {
                    eprintln!("ABM_SETPOS returned 0 during update; will fall back to re-register");
                    false
                } else {
                    // Move window to match
                    let _ = SetWindowPos(
                        hwnd,
                        HWND_TOPMOST,
                        abd.rc.left,
                        abd.rc.top,
                        abd.rc.right - abd.rc.left,
                        abd.rc.bottom - abd.rc.top,
                        SWP_NOACTIVATE | SWP_SHOWWINDOW,
                    );
                    true
                }
            }
        };

        if !updated_ok {
            APPBAR_REGISTERED.store(false, Ordering::SeqCst);
            return register_appbar(hwnd, x, y, width, height);
        }

        Ok(())
    }

    /// Get the work area (screen minus taskbars) for the primary monitor
    pub fn get_primary_work_area() -> (i32, i32, i32, i32) {
        use windows::Win32::UI::WindowsAndMessaging::{
            SystemParametersInfoW, SPI_GETWORKAREA, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
        };

        unsafe {
            let mut rect = RECT::default();
            let _ = SystemParametersInfoW(
                SPI_GETWORKAREA,
                0,
                Some(&mut rect as *mut _ as *mut _),
                SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
            );
            (
                rect.left,
                rect.top,
                rect.right - rect.left,
                rect.bottom - rect.top,
            )
        }
    }

    /// Get the full screen dimensions for the primary monitor (DPI-aware)
    pub fn get_primary_screen_size() -> (i32, i32) {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::Graphics::Gdi::{
            GetDC, GetDeviceCaps, ReleaseDC, HORZRES, LOGPIXELSX, VERTRES,
        };

        unsafe {
            // Get the device context for the entire screen
            let hdc = GetDC(HWND::default());

            // Get actual pixel dimensions
            let width = GetDeviceCaps(hdc, HORZRES);
            let height = GetDeviceCaps(hdc, VERTRES);

            // Get DPI to understand scaling
            let dpi = GetDeviceCaps(hdc, LOGPIXELSX);
            let scale = dpi as f64 / 96.0; // 96 DPI is 100% scaling

            ReleaseDC(HWND::default(), hdc);

            if std::env::var_os("BAR_VERBOSE_LOGS").is_some() {
                eprintln!(
                    "Screen: {}x{}, DPI: {}, Scale: {:.2}x",
                    width, height, dpi, scale
                );
            }
            (width, height)
        }
    }

    /// Check if the foreground window is occupying the full monitor area (fullscreen/borderless)
    /// AND is on the same monitor as the bar window.
    pub fn is_foreground_fullscreen(bar_hwnd: isize) -> bool {
        unsafe {
            use windows::Win32::UI::WindowsAndMessaging::GetParent;

            let bar_hwnd = HWND(bar_hwnd as *mut _);

            let fg_raw = GetForegroundWindow();
            if fg_raw.0.is_null() {
                return false;
            }

            // WebView2 can report a child window (e.g. Chrome_WidgetWin_0) as the foreground window,
            // and that child may belong to a different process. Walk the parent chain: if *any*
            // ancestor belongs to our process (or matches exclude_hwnd), treat it as our own window
            // and do not auto-hide.
            let current_pid = GetCurrentProcessId();
            let mut cursor = fg_raw;
            for _ in 0..32 {
                if cursor == bar_hwnd {
                    return false;
                }

                let mut pid: u32 = 0;
                let _tid = GetWindowThreadProcessId(cursor, Some(&mut pid));
                if pid != 0 && pid == current_pid {
                    return false;
                }

                let parent = match GetParent(cursor) {
                    Ok(hwnd) => hwnd,
                    Err(_) => HWND::default(),
                };
                if parent.0.is_null() {
                    break;
                }
                cursor = parent;
            }

            // Use the highest ancestor we reached for bounds checks.
            let fg = cursor;

            if !IsWindowVisible(fg).as_bool() {
                return false;
            }

            // Skip minimized windows
            let mut placement: WINDOWPLACEMENT = std::mem::zeroed();
            placement.length = std::mem::size_of::<WINDOWPLACEMENT>() as u32;
            if GetWindowPlacement(fg, &mut placement).is_ok() {
                if placement.showCmd as i32 == SW_SHOWMINIMIZED.0 {
                    return false;
                }
            }

            // Get window rectangle
            let mut rect = RECT::default();
            if GetWindowRect(fg, &mut rect).is_err() {
                return false;
            }

            // Compare against monitor bounds
            let monitor = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
            let bar_monitor = MonitorFromWindow(bar_hwnd, MONITOR_DEFAULTTONEAREST);

            // Only auto-hide if the fullscreen app is on the same monitor as the bar.
            if monitor != bar_monitor {
                return false;
            }

            let mut info = MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            if !GetMonitorInfoW(monitor, &mut info).as_bool() {
                return false;
            }
            let width = rect.right - rect.left;
            let height = rect.bottom - rect.top;
            let monitor_width = info.rcMonitor.right - info.rcMonitor.left;
            let monitor_height = info.rcMonitor.bottom - info.rcMonitor.top;

            // Allow a 1-2px tolerance for borders/rounding
            let matches_width = (width - monitor_width).abs() <= 2;
            let matches_height = (height - monitor_height).abs() <= 2;
            let aligned_left = (rect.left - info.rcMonitor.left).abs() <= 1;
            let aligned_top = (rect.top - info.rcMonitor.top).abs() <= 1;

            let is_fullscreen = matches_width && matches_height && aligned_left && aligned_top;

            #[cfg(debug_assertions)]
            if is_fullscreen {
                eprintln!(
                    "Fullscreen detected: fg_raw={:?} fg_ancestor={:?} rect=({}, {}, {}, {}) monitor=({}, {}, {}, {})",
                    fg_raw,
                    fg,
                    rect.left,
                    rect.top,
                    rect.right,
                    rect.bottom,
                    info.rcMonitor.left,
                    info.rcMonitor.top,
                    info.rcMonitor.right,
                    info.rcMonitor.bottom
                );
            }

            is_fullscreen
        }
    }
}

#[cfg(not(windows))]
pub mod windows_appbar {
    pub fn register_appbar(
        _hwnd: isize,
        _x: i32,
        _y: i32,
        _width: i32,
        _height: i32,
    ) -> Result<(), String> {
        Err("AppBar only supported on Windows".to_string())
    }

    pub fn unregister_appbar(_hwnd: isize) -> Result<(), String> {
        Ok(())
    }

    pub fn update_appbar_position(
        _hwnd: isize,
        _x: i32,
        _y: i32,
        _width: i32,
        _height: i32,
    ) -> Result<(), String> {
        Err("AppBar only supported on Windows".to_string())
    }

    pub fn get_primary_work_area() -> (i32, i32, i32, i32) {
        (0, 0, 1920, 1080)
    }

    pub fn get_primary_screen_size() -> (i32, i32) {
        (1920, 1080)
    }

    pub fn is_foreground_fullscreen(_bar_hwnd: isize) -> bool {
        false
    }
}

pub use windows_appbar::*;
