interface SystemTabProps {
    isAdmin: boolean
    autostartEnabled: boolean
    factoryResetting: boolean
    showFactoryResetConfirm: boolean
    factoryResetError: string | null
    onAutostartToggle: (enabled: boolean) => void
    onFactoryResetClick: () => void
    onFactoryResetConfirm: () => void
    onFactoryResetCancel: () => void
}

export function SystemTab({
    isAdmin,
    autostartEnabled,
    factoryResetting,
    showFactoryResetConfirm,
    factoryResetError,
    onAutostartToggle,
    onFactoryResetClick,
    onFactoryResetConfirm,
    onFactoryResetCancel,
}: SystemTabProps) {
    return (
        <div className="settings-section">
            {!isAdmin && (
                <div className="setting-row setting-row--warning">
                    <div className="setting-warning">
                        <span className="setting-warning__icon">⚠️</span>
                        <div className="setting-warning__content">
                            <span className="setting-warning__title">Modo Limitado</span>
                            <span className="setting-warning__text">
                                A aplicação está rodando sem privilégios de administrador.
                                Alguns recursos como reserva de espaço da barra (AppBar) podem não funcionar corretamente.
                                Para recursos completos, feche e execute como Administrador.
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {isAdmin && (
                <div className="setting-row setting-row--success">
                    <div className="setting-success">
                        <span className="setting-success__icon">✓</span>
                        <span className="setting-success__text">Executando com privilégios de administrador</span>
                    </div>
                </div>
            )}

            <div className="setting-row">
                <label className="setting-label">
                    <span>Iniciar com Windows</span>
                    <span className="setting-hint">Abrir automaticamente ao iniciar o sistema</span>
                </label>
                <div className="setting-control">
                    <label className="toggle">
                        <input
                            type="checkbox"
                            checked={autostartEnabled}
                            onChange={e => onAutostartToggle(e.target.checked)}
                        />
                        <span className="toggle__slider"></span>
                    </label>
                </div>
            </div>

            <div className="setting-row">
                <label className="setting-label">
                    <span>Resetar configurações</span>
                    <span className="setting-hint">Apaga perfil/config/cache e recria o Default do zero</span>
                </label>
                <div className="setting-control">
                    <button
                        className="btn btn--danger"
                        disabled={factoryResetting}
                        onClick={onFactoryResetClick}
                    >
                        {factoryResetting ? 'Resetando...' : 'Factory Reset'}
                    </button>
                </div>
            </div>

            {showFactoryResetConfirm && (
                <div className="settings-reset">
                    <div className="settings-reset__title">Confirmação</div>
                    <div className="settings-reset__text">
                        Isso vai apagar perfis/config/cache e recriar tudo do zero.
                        {factoryResetError ? `\n\nErro: ${factoryResetError}` : ''}
                    </div>
                    <div className="settings-reset__actions">
                        <button
                            className="btn btn--secondary"
                            disabled={factoryResetting}
                            onClick={onFactoryResetCancel}
                        >
                            Cancelar
                        </button>
                        <button
                            className="btn btn--danger"
                            disabled={factoryResetting}
                            onClick={onFactoryResetConfirm}
                        >
                            Confirmar
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
