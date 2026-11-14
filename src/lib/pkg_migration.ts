// shared between the kernel (which moves legacy package folders aside at boot) and pkg (which reinstalls them)

export const LEGACY_PACKAGE_BACKUP_ROOT = "/var/backup/packages";
export const MIGRATION_PATH = `${LEGACY_PACKAGE_BACKUP_ROOT}/migration.json`;

export interface MigrationState {
    backup_dir: string;
    packages: string[];
    graph_reset: boolean;
}
