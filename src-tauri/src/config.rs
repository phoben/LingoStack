//! 应用配置文件读写（设计文档 §8）。
//!
//! 配置存 JSON 于 `dirs::config_dir()/lingostack/config.json`。Unix 权限 0600；
//! Windows 暂用文件默认 ACL（后续按用户 SID 收紧，见 §11.4 安全治理）。

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use lingostack_core::config::AppConfig;

/// 配置文件错误。
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error(transparent)]
    Io(#[from] io::Error),
    #[error("配置文件解析失败: {0}")]
    Json(#[from] serde_json::Error),
}

/// 配置文件标准路径：`<config_dir>/lingostack/config.json`。
#[must_use]
pub fn config_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("lingostack")
        .join("config.json")
}

/// 加载配置；文件不存在视为首次运行，返回默认值（不报错）。
pub fn load(path: &Path) -> Result<AppConfig, ConfigError> {
    match fs::read_to_string(path) {
        Ok(text) => {
            let mut config: AppConfig = serde_json::from_str(&text)?;
            config.normalize_hotkeys();
            Ok(config)
        }
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(AppConfig::default()),
        Err(e) => Err(ConfigError::Io(e)),
    }
}

/// 保存配置：确保父目录存在 → 写 pretty JSON → 收紧权限。
pub fn save(path: &Path, config: &AppConfig) -> Result<(), ConfigError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut normalized = config.clone();
    normalized.normalize_hotkeys();
    let text = serde_json::to_string_pretty(&normalized)?;
    fs::write(path, text)?;
    restrict_permissions(path)?;
    Ok(())
}

/// 收紧文件权限：Unix 设 0600；Windows 暂留默认（待 ACL 加固）。
fn restrict_permissions(path: &Path) -> Result<(), ConfigError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(path)?.permissions();
        perms.set_mode(0o600);
        fs::set_permissions(path, perms)?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use lingostack_core::config::UiLanguage;
    use lingostack_core::config::{ProviderConfig, ProviderKind};

    #[test]
    fn load_missing_file_returns_default() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        let cfg = load(&path).unwrap();
        assert!(cfg.providers.is_empty());
        assert_eq!(cfg.ui_language, UiLanguage::System);
    }

    #[test]
    fn save_creates_parent_dirs_and_roundtrips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join("dir").join("config.json");
        let mut cfg = AppConfig::default();
        cfg.providers.push(ProviderConfig {
            id: "deepseek-1".into(),
            kind: ProviderKind::OpenAiCompatible,
            name: "DeepSeek".into(),
            base_url: "https://api.deepseek.com".into(),
            api_key: "sk-test".into(),
            models: vec!["deepseek-chat".into()],
        });
        save(&path, &cfg).unwrap();
        assert!(path.exists());
        let back = load(&path).unwrap();
        assert_eq!(back.providers.len(), 1);
        assert_eq!(back.providers[0].api_key, "sk-test");
    }

    #[test]
    fn save_writes_pretty_json_with_known_fields() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        save(&path, &AppConfig::default()).unwrap();
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains('\n'), "应为 pretty 多行 JSON");
        assert!(text.contains("\"ui_language\""));
    }

    #[test]
    fn corrupted_file_errors() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, "{ not json").unwrap();
        assert!(matches!(load(&path).err(), Some(ConfigError::Json(_))));
    }
}
