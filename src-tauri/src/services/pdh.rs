//! PDH (Performance Counters) helpers for generic Windows telemetry.
//!
//! This is used as a fallback when WMI is unavailable/slow or when
//! vendor-specific telemetry is not available.

#[cfg(windows)]
use std::sync::{Mutex, OnceLock};

#[cfg(windows)]
use windows::core::PCWSTR;

#[cfg(windows)]
use windows::Win32::Foundation::ERROR_SUCCESS;

#[cfg(windows)]
use windows::Win32::System::Performance::{
    PdhAddEnglishCounterW, PdhCollectQueryData, PdhCloseQuery, PdhGetFormattedCounterArrayW,
    PdhGetFormattedCounterValue, PdhOpenQueryW, PDH_FMT_COUNTERVALUE, PDH_FMT_COUNTERVALUE_ITEM_W,
    PDH_FMT_DOUBLE,
};

#[cfg(windows)]
fn to_wide(s: &str) -> Vec<u16> {
    let mut v: Vec<u16> = s.encode_utf16().collect();
    v.push(0);
    v
}

#[cfg(windows)]
fn pwstr_to_string(p: windows::core::PWSTR) -> String {
    if p.0.is_null() {
        return String::new();
    }
    unsafe {
        let mut len = 0usize;
        while *p.0.add(len) != 0 {
            len += 1;
        }
        let slice = std::slice::from_raw_parts(p.0, len);
        String::from_utf16_lossy(slice)
    }
}

#[cfg(windows)]
#[derive(Debug)]
struct SingleCounterQuery {
    query: isize,
    counter: isize,
    primed: bool,
}

#[cfg(windows)]
impl Drop for SingleCounterQuery {
    fn drop(&mut self) {
        unsafe {
            let _ = PdhCloseQuery(self.query);
        }
    }
}

#[cfg(windows)]
fn init_single_counter(counter_path: &str) -> Option<SingleCounterQuery> {
    unsafe {
        let mut query: isize = 0;
        let status = PdhOpenQueryW(PCWSTR::null(), 0, &mut query);
        if status != ERROR_SUCCESS.0 {
            return None;
        }

        let path_w = to_wide(counter_path);
        let mut counter: isize = 0;
        let status = PdhAddEnglishCounterW(query, PCWSTR(path_w.as_ptr()), 0, &mut counter);
        if status != ERROR_SUCCESS.0 {
            let _ = PdhCloseQuery(query);
            return None;
        }

        Some(SingleCounterQuery {
            query,
            counter,
            primed: false,
        })
    }
}

#[cfg(windows)]
fn sample_single_counter_percent(state: &mut SingleCounterQuery) -> Option<f32> {
    unsafe {
        let status = PdhCollectQueryData(state.query);
        if status != ERROR_SUCCESS.0 {
            return None;
        }

        // First sample primes the counter (needs 2 deltas for many counters).
        if !state.primed {
            state.primed = true;
            return None;
        }

        let mut counter_type: u32 = 0;
        let mut value = PDH_FMT_COUNTERVALUE::default();
        let status = PdhGetFormattedCounterValue(
            state.counter,
            PDH_FMT_DOUBLE,
            Some(&mut counter_type),
            &mut value,
        );
        if status != ERROR_SUCCESS.0 {
            return None;
        }

        // SAFETY: PDH_FMT_COUNTERVALUE contains a union; for PDH_FMT_DOUBLE we read doubleValue.
        let raw = value.Anonymous.doubleValue;
        if !raw.is_finite() {
            return None;
        }

        Some(raw.clamp(0.0, 100.0) as f32)
    }
}

#[cfg(windows)]
#[derive(Debug)]
struct MultiCounterQuery {
    query: isize,
    counter: isize,
    primed: bool,
}

#[cfg(windows)]
impl Drop for MultiCounterQuery {
    fn drop(&mut self) {
        unsafe {
            let _ = PdhCloseQuery(self.query);
        }
    }
}

#[cfg(windows)]
fn init_multi_counter(counter_path: &str) -> Option<MultiCounterQuery> {
    unsafe {
        let mut query: isize = 0;
        let status = PdhOpenQueryW(PCWSTR::null(), 0, &mut query);
        if status != ERROR_SUCCESS.0 {
            return None;
        }

        let path_w = to_wide(counter_path);
        let mut counter: isize = 0;
        let status = PdhAddEnglishCounterW(query, PCWSTR(path_w.as_ptr()), 0, &mut counter);
        if status != ERROR_SUCCESS.0 {
            let _ = PdhCloseQuery(query);
            return None;
        }

        Some(MultiCounterQuery {
            query,
            counter,
            primed: false,
        })
    }
}

#[cfg(windows)]
fn sample_multi_counter_percent_max(state: &mut MultiCounterQuery) -> Option<f32> {
    unsafe {
        let status = PdhCollectQueryData(state.query);
        if status != ERROR_SUCCESS.0 {
            return None;
        }

        if !state.primed {
            state.primed = true;
            return None;
        }

        let mut buffer_size: u32 = 0;
        let mut item_count: u32 = 0;

        // First call to get required buffer size.
        let _status = PdhGetFormattedCounterArrayW(
            state.counter,
            PDH_FMT_DOUBLE,
            &mut buffer_size,
            &mut item_count,
            None,
        );

        // PDH_MORE_DATA is a non-zero status; we just need the sizes.
        // If we didn't get sizes, bail.
        if buffer_size == 0 || item_count == 0 {
            return None;
        }

        let mut buffer = vec![0u8; buffer_size as usize];
        let items_ptr = buffer.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;

        let status = PdhGetFormattedCounterArrayW(
            state.counter,
            PDH_FMT_DOUBLE,
            &mut buffer_size,
            &mut item_count,
            Some(items_ptr),
        );
        if status != ERROR_SUCCESS.0 {
            return None;
        }

        let items = std::slice::from_raw_parts(items_ptr, item_count as usize);
        let mut max_value = 0.0f64;

        for item in items {
            // Some instances can be noisy; we just take max as an overall utilization proxy.
            let name = pwstr_to_string(item.szName);
            let v = item.FmtValue.Anonymous.doubleValue;
            if !v.is_finite() {
                continue;
            }

            // Filter out completely empty names (shouldn't happen)
            if name.is_empty() {
                continue;
            }

            if v > max_value {
                max_value = v;
            }
        }

        Some((max_value.clamp(0.0, 100.0)) as f32)
    }
}

#[cfg(windows)]
static CPU_TOTAL_QUERY: OnceLock<Mutex<Option<SingleCounterQuery>>> = OnceLock::new();

#[cfg(windows)]
static GPU_ENGINE_QUERY: OnceLock<Mutex<Option<MultiCounterQuery>>> = OnceLock::new();

/// Total CPU usage percent via PDH: \\Processor(_Total)\\% Processor Time
#[cfg(windows)]
pub fn cpu_total_usage_percent() -> Option<f32> {
    let holder = CPU_TOTAL_QUERY.get_or_init(|| Mutex::new(None));
    let mut guard = holder.lock().ok()?;

    if guard.is_none() {
        *guard = init_single_counter("\\\\Processor(_Total)\\\\% Processor Time");
    }

    if let Some(ref mut q) = *guard {
        sample_single_counter_percent(q)
    } else {
        None
    }
}

/// Overall GPU usage percent proxy via PDH: \\GPU Engine(*)\\Utilization Percentage
///
/// Note: Windows exposes multiple engine instances (3D, Copy, Video Decode, etc.).
/// A practical overall metric is the MAX utilization across engines.
#[cfg(windows)]
pub fn gpu_usage_percent() -> Option<f32> {
    let holder = GPU_ENGINE_QUERY.get_or_init(|| Mutex::new(None));
    let mut guard = holder.lock().ok()?;

    if guard.is_none() {
        *guard = init_multi_counter("\\\\GPU Engine(*)\\\\Utilization Percentage");
    }

    if let Some(ref mut q) = *guard {
        sample_multi_counter_percent_max(q)
    } else {
        None
    }
}

// Non-Windows stubs
#[cfg(not(windows))]
pub fn cpu_total_usage_percent() -> Option<f32> {
    None
}

#[cfg(not(windows))]
pub fn gpu_usage_percent() -> Option<f32> {
    None
}
