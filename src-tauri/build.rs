fn main() {
    // Embed Windows manifest for admin elevation
    #[cfg(windows)]
    {
        let mut windows = tauri_build::WindowsAttributes::new();
        windows = windows.app_manifest(include_str!("app.manifest"));
        tauri_build::try_build(
            tauri_build::Attributes::new().windows_attributes(windows)
        ).expect("failed to run tauri_build");
    }
    
    #[cfg(not(windows))]
    {
        tauri_build::build();
    }
    
    // Copy iCUE SDK DLL to output directory
    #[cfg(windows)]
    {
        use std::path::Path;
        use std::fs;
        
        let sdk_dll = Path::new("libs/iCUESDK/iCUESDK.x64_2019.dll");
        
        if sdk_dll.exists() {
            // Get the output directory from environment
            if let Ok(out_dir) = std::env::var("OUT_DIR") {
                // Navigate up from OUT_DIR to find target/debug or target/release
                let out_path = Path::new(&out_dir);
                
                // Try to find the target directory
                let mut target_dir = out_path;
                for _ in 0..5 {
                    if let Some(parent) = target_dir.parent() {
                        target_dir = parent;
                        if target_dir.file_name().map(|n| n == "debug" || n == "release").unwrap_or(false) {
                            let dest = target_dir.join("iCUESDK.x64_2019.dll");
                            if !dest.exists() {
                                let _ = fs::copy(sdk_dll, &dest);
                                println!("cargo:warning=Copied iCUE SDK to {:?}", dest);
                            }
                            break;
                        }
                    }
                }
            }
            
            println!("cargo:rerun-if-changed=libs/iCUESDK/iCUESDK.x64_2019.dll");
        }
    }
}
