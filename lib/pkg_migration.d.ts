export declare const LEGACY_PACKAGE_BACKUP_ROOT = "/var/backup/packages";
export declare const MIGRATION_PATH = "/var/backup/packages/migration.json";
export interface MigrationState {
    backup_dir: string;
    packages: string[];
    graph_reset: boolean;
}
