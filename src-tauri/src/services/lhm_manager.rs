//! LibreHardwareMonitor process manager
//! 
//! This module handles starting and stopping LibreHardwareMonitor.exe
//! to ensure CPU temperature data is available via WMI.

use std::process::{Child, Command};
use std::sync::{Arc, Mutex, OnceLock};
use std::path::PathBuf;

static LHM_MANAGER: OnceLock<Arc<Mutex<LhmManager>>> = OnceLock::new();

/// Manager for LibreHardwareMonitor process
pub struct LhmManager {
    process: Option<Child>,
    exe_path: Option<PathBuf>,
}

impl LhmManager {
    pub fn new() -> Self {
        let exe_path = find_lhm_executable();
        Self {
            process: None,
            exe_path,
        }
    }
    
    /// Get the global instance
    pub fn instance() -> Arc<Mutex<LhmManager>> {
        LHM_MANAGER.get_or_init(|| {
            Arc::new(Mutex::new(LhmManager::new()))
        }).clone()
    }
    
    /// Check if LibreHardwareMonitor is available
    pub fn is_available(&self) -> bool {
        self.exe_path.is_some()
    }
    
    /// Check if LibreHardwareMonitor is running (either our instance or external)
    pub fn is_running(&self) -> bool {
        // Check if our managed process is running
        if self.process.is_some() {
            // We have a process handle, assume it's still running
            return true;
        }
        
        // Check for external LHM process via tasklist
        check_lhm_process_running()
    }
    
    /// Start LibreHardwareMonitor minimized in background
    pub fn start(&mut self) -> Result<(), String> {
        if self.is_running() {
            return Ok(()); // Already running
        }

        let exe_path = self.exe_path.as_ref()
            .ok_or("LibreHardwareMonitor executable not found")?;

        eprintln!("[LHM] Iniciando LibreHardwareMonitor...");

        #[cfg(windows)]
        {
            // Change to LHM directory before starting (required for dependencies)
            let lhm_dir = exe_path.parent().ok_or("Failed to get LHM directory")?;

            eprintln!("[LHM] Diretório: {}", lhm_dir.display());
            eprintln!("[LHM] Executável: {}", exe_path.display());

            let child = Command::new(exe_path)
                .current_dir(lhm_dir)
                .spawn();

            match child {
                Ok(process) => {
                    let pid = process.id();
                    eprintln!("[LHM] Processo iniciado (PID: {})", pid);

                    // Don't keep handle - let it run independently
                    std::mem::drop(process);

                    eprintln!("[LHM] Aguardando inicialização do WMI (7 segundos)...");
                    std::thread::sleep(std::time::Duration::from_secs(7));

                    if check_lhm_process_running() {
                        eprintln!("[LHM] ✅ Processo confirmado rodando");

                        if let Ok(_) = test_lhm_wmi() {
                            eprintln!("[LHM] ✅ Namespace WMI disponível");
                            return Ok(());
                        }

                        eprintln!("[LHM] ⚠️  Namespace WMI ainda não disponível (pode demorar mais)");
                        return Ok(());
                    }

                    Err("Processo não encontrado após iniciar (pode ter crashado)".to_string())
                }
                Err(e) => Err(format!(
                    "Falha ao iniciar LibreHardwareMonitor: {}. Execute o app como Administrador.",
                    e
                )),
            }
        }

        #[cfg(not(windows))]
        Err("LHM apenas suportado no Windows".to_string())
    }
    
    /// Stop the managed LibreHardwareMonitor process
    pub fn stop(&mut self) {
        if let Some(mut process) = self.process.take() {
            let _ = process.kill();
            let _ = process.wait();
        }
    }
    
    /// Ensure LibreHardwareMonitor is running (start if needed)
    pub fn ensure_running(&mut self) -> Result<(), String> {
        if !self.is_running() {
            self.start()?;
        }
        Ok(())
    }
}

impl Drop for LhmManager {
    fn drop(&mut self) {
        self.stop();
    }
}

impl Default for LhmManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Find the LibreHardwareMonitor executable
fn find_lhm_executable() -> Option<PathBuf> {
    eprintln!("[DEBUG] Searching for LibreHardwareMonitor executable...");
    
    // Check in resources directory (bundled with app)
    if let Ok(exe_path) = std::env::current_exe() {
        eprintln!("[DEBUG] Current executable: {}", exe_path.display());
        
        if let Some(dir) = exe_path.parent() {
            eprintln!("[DEBUG] Executable directory: {}", dir.display());
            
            // Check same directory as exe
            let lhm_path = dir.join("LibreHardwareMonitor.exe");
            eprintln!("[DEBUG] Checking: {}", lhm_path.display());
            if lhm_path.exists() {
                eprintln!("[DEBUG] Found LHM at: {}", lhm_path.display());
                return Some(lhm_path);
            }
            
            // Check in source tree (development mode)
            // From target/debug or target/release, go up to src-tauri then to libs
            if let Some(parent) = dir.parent() {
                if let Some(grandparent) = parent.parent() {
                    let lhm_path = grandparent
                        .join("libs")
                        .join("LibreHardwareMonitor")
                        .join("LibreHardwareMonitor.exe");
                    eprintln!("[DEBUG] Checking dev source path: {}", lhm_path.display());
                    if lhm_path.exists() {
                        eprintln!("[DEBUG] Found LHM at dev source: {}", lhm_path.display());
                        return Some(lhm_path);
                    }
                }
            }

            // Check in libs subdirectory (production/debug build)
            let lhm_path = dir
                .join("libs")
                .join("LibreHardwareMonitor")
                .join("LibreHardwareMonitor.exe");
            eprintln!("[DEBUG] Checking: {}", lhm_path.display());
            if lhm_path.exists() {
                eprintln!("[DEBUG] Found LHM at: {}", lhm_path.display());
                return Some(lhm_path);
            }

            // Check in resources subdirectory (Tauri bundled)
            let lhm_path = dir.join("resources").join("LibreHardwareMonitor.exe");
            eprintln!("[DEBUG] Checking: {}", lhm_path.display());
            if lhm_path.exists() {
                eprintln!("[DEBUG] Found LHM at: {}", lhm_path.display());
                return Some(lhm_path);
            }
        }
    }
    
    // Check in Program Files
    let program_files_paths = [
        r"C:\Program Files\LibreHardwareMonitor\LibreHardwareMonitor.exe",
        r"C:\Program Files (x86)\LibreHardwareMonitor\LibreHardwareMonitor.exe",
    ];
    
    for path in program_files_paths {
        eprintln!("[DEBUG] Checking: {}", path);
        let p = PathBuf::from(path);
        if p.exists() {
            eprintln!("[DEBUG] Found LHM at: {}", path);
            return Some(p);
        }
    }
    
    eprintln!("[DEBUG] LibreHardwareMonitor executable not found in any location");
    None
}

/// Check if LibreHardwareMonitor is already running
fn check_lhm_process_running() -> bool {
    #[cfg(windows)]
    {
        use std::process::Command;
        
        if let Ok(output) = Command::new("tasklist")
            .args(["/FI", "IMAGENAME eq LibreHardwareMonitor.exe", "/NH"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            return stdout.contains("LibreHardwareMonitor");
        }
    }
    
    false
}

/// Test if LHM WMI namespace is accessible
fn test_lhm_wmi() -> Result<(), String> {
    use wmi::{COMLibrary, WMIConnection};
    
    let com_lib = COMLibrary::new().map_err(|e| format!("COM init failed: {}", e))?;
    let _wmi_con = WMIConnection::with_namespace_path("root\\LibreHardwareMonitor", com_lib)
        .map_err(|e| format!("LHM WMI connection failed: {}", e))?;
    
    Ok(())
}

/// Initialize LibreHardwareMonitor at startup
pub fn init_lhm() {
    std::thread::spawn(|| {
        eprintln!("═══════════════════════════════════════════");
        eprintln!("  Inicializando LibreHardwareMonitor");
        eprintln!("═══════════════════════════════════════════");
        eprintln!("");

        #[cfg(windows)]
        log_driver_blocklist_status();
        
        // Check if LHM is already running externally
        if check_lhm_process_running() {
            eprintln!("✅ LibreHardwareMonitor já está em execução");
            eprintln!("");
            return;
        }
        
        // Try to start LHM
        eprintln!("⚙️  Tentando iniciar LibreHardwareMonitor...");
        let manager = LhmManager::instance();
        
        let result = {
            let mut guard = match manager.lock() {
                Ok(g) => g,
                Err(e) => {
                    eprintln!("❌ Erro ao acessar gerenciador: {}", e);
                    return;
                },
            };
            
            guard.start()
        };
        
        match result {
            Ok(_) => {
                eprintln!("");
                eprintln!("✅ LibreHardwareMonitor iniciado com sucesso!");
                eprintln!("   Temperatura da CPU estará disponível em breve");
                eprintln!("");
            }
            Err(e) => {
                eprintln!("");
                eprintln!("❌ Falha ao iniciar LibreHardwareMonitor: {}", e);
                eprintln!("");
                eprintln!("   Para monitoramento de temperatura:");
                eprintln!("   1. Abra: src-tauri\\libs\\LibreHardwareMonitor\\");
                eprintln!("   2. Execute: LibreHardwareMonitor.exe");
                eprintln!("   3. Aceite o UAC (executar como Admin)");
                eprintln!("   4. Minimize para bandeja do sistema");
                eprintln!("");
            }
        }
        eprintln!("");
        eprintln!("⚠️  LibreHardwareMonitor não está rodando");
        eprintln!("");
        eprintln!("   Execute manualmente para monitoramento de temperatura:");
        eprintln!("   1. Navegue até: src-tauri\\libs\\LibreHardwareMonitor\\");
        eprintln!("   2. Clique com botão direito em LibreHardwareMonitor.exe");
        eprintln!("   3. Selecione 'Executar como administrador'");
        eprintln!("   4. Minimize para a bandeja do sistema");
        eprintln!("");
        eprintln!("   Temperatura da CPU não será exibida até que o LHM esteja rodando.");
        eprintln!("");
    });
}

#[cfg(windows)]
fn log_driver_blocklist_status() {
    use std::process::Command;

    let output = Command::new("reg")
        .args([
            "query",
            r"HKLM\SYSTEM\CurrentControlSet\Control\CI\Config",
            "/v",
            "VulnerableDriverBlocklistEnable",
        ])
        .output();

    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        if stdout.contains("VulnerableDriverBlocklistEnable") {
            if stdout.contains("0x1") {
                eprintln!("⚠️  Vulnerable Driver Blocklist está ATIVADO.");
                eprintln!("    Isso pode bloquear o driver do LibreHardwareMonitor e impedir leitura de temperatura.");
            } else if stdout.contains("0x0") {
                eprintln!("✅ Vulnerable Driver Blocklist está DESATIVADO.");
            }
        }
    }
}

/// Shutdown LibreHardwareMonitor
pub fn shutdown_lhm() {
    let manager = LhmManager::instance();
    let mut guard = match manager.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    guard.stop();
}
