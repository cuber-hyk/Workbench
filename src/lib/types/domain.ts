export type ViewKey = "projects" | "skills" | "radar" | "settings";

export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface PageResult<T> extends PageRequest {
  total: number;
  items: T[];
}

export interface Project {
  id: string;
  name: string;
  path: string;
  note: string;
  tags: string[];
  launchConfigs: ProjectLaunchConfig[];
  archived: boolean;
}

export interface ProjectLaunchConfig {
  id: string;
  name: string;
  command: string;
  workdir: string;
  enabled: boolean;
}

export type ProjectOpenProfileKind = "app" | "terminal";

export interface ProjectOpenProfile {
  id: string;
  name: string;
  kind: ProjectOpenProfileKind;
  command: string;
  executablePath: string;
  args: string[];
  workdir: string;
  enabled: boolean;
  sortOrder: number;
}

export type LaunchSessionStatus = "starting" | "running" | "exited" | "failed" | "stopped";

export interface LaunchOutputChunk {
  stream: "stdout" | "stderr";
  content: string;
}

export interface LaunchSession {
  id: string;
  launchRunId: string;
  configId: string;
  configName: string;
  command: string;
  workdir: string;
  status: LaunchSessionStatus;
  exitCode?: number;
  output: LaunchOutputChunk[];
}

export interface LaunchRun {
  id: string;
  projectId: string;
  projectName: string;
  startedAt: string;
  sessions: LaunchSession[];
}

export interface LaunchSessionEvent {
  launchRunId: string;
  sessionId: string;
  eventType: "output" | "status";
  stream?: "stdout" | "stderr";
  content?: string;
  status?: LaunchSessionStatus;
  exitCode?: number;
}

export interface LaunchSessionSnapshot {
  launchRunId: string;
  sessionId: string;
  status: LaunchSessionStatus;
  exitCode?: number;
  output: LaunchOutputChunk[];
}

export interface SkillCategory {
  id: string;
  name: string;
  sortOrder: number;
  skillCount: number;
}

export type ToolKey = string;

export interface ToolTarget {
  key: ToolKey;
  name: string;
  globalSkillsDir: string;
  supportsProjectScope: boolean;
  available: boolean;
  source?: "builtin" | "custom";
  iconPath?: string | null;
}

export interface CustomToolTargetInput {
  key?: ToolKey | null;
  name: string;
  globalSkillsDir: string;
  iconSourcePath?: string | null;
  iconPath?: string | null;
}

export type SkillVersionSource = "workbench" | ToolKey;

export interface Skill {
  id: string;
  directoryName: string;
  name: string;
  description: string;
  categoryId: string;
  category: string;
  skillPath: string;
  enabledTools: ToolKey[];
  enabledToolMethods: Array<{ tool: ToolKey; syncMethod: "symlink" | "copy" }>;
  globalToolStates: Array<{
    tool: ToolKey;
    status: "disabled" | "managed" | "conflict";
    syncMethod?: "symlink" | "copy";
  }>;
  enabledProjects: Array<{
    projectName: string;
    projectPath: string;
    tool: ToolKey;
    syncMethod: "symlink" | "copy";
  }>;
}

export type SkillUpdateState = "not_installed" | "installed" | "up_to_date" | "update_available" | "check_failed" | "unsupported";

export interface SkillMarketItem {
  source: string;
  skillId: string;
  name: string;
  description: string;
  installs: number;
  official: boolean;
  installedDirectoryName?: string | null;
  updateStatus: SkillUpdateState;
  installable: boolean;
}

export type SkillMarketMode = "leaderboard" | "search";

export interface SkillMarketResponse {
  items: SkillMarketItem[];
  mode: SkillMarketMode;
  query: string;
  loaded: number;
  hasMore: boolean;
  limit?: number | null;
  message?: string | null;
}

export interface SkillMarketDetail {
  item: SkillMarketItem;
  repositoryUrl: string;
  installCommand: string;
  skillMarkdownPreview: string;
  securityNote: string;
}

export interface SkillInstallProgress {
  source: string;
  skillId: string;
  progress: number;
}

export interface SkillUpdateProgress {
  directoryName: string;
  progress: number;
}

export interface SkillSourceRecord {
  directoryName: string;
  source: string;
  packageSlug: string;
  repoUrl: string;
  skillPath: string;
  installedRef: string;
  installedHash: string;
  remoteRef: string;
  lastCheckedAt: string;
  installedAt: string;
  updatedAt: string;
}

export interface SkillUpdateStatus {
  source: SkillSourceRecord;
  name: string;
  description: string;
  status: SkillUpdateState;
  message: string;
}

export interface SkillUpdateResult {
  directoryName: string;
  status: SkillUpdateState;
  message: string;
}

export type RadarCategory = "项目" | "资讯" | "论文" | "其他";
export type RadarSource = "manual" | "github_star";

export interface RadarSourceMetadata {
  language: string;
  topics: string[];
  stars: number;
  repositoryUpdatedAt: string;
}

export interface RadarItem {
  id: string;
  name: string;
  category: RadarCategory;
  domain: string;
  url: string;
  tags: string[];
  note: string;
  favorite: boolean;
  updatedAt: string;
  source: RadarSource;
  sources: RadarSource[];
  externalId: string;
  sourceDescription: string;
  sourceMetadata: RadarSourceMetadata;
  sourceActive: boolean;
  lastSyncedAt: string;
}

export interface RadarDuplicateGroup {
  id: string;
  source: RadarSource;
  externalId: string;
  candidateIds: string[];
  candidates: RadarItem[];
  status: "open" | "resolved";
  updatedAt: string;
}

export interface GitHubStarsSyncResult {
  items: RadarItem[];
  added: number;
  updated: number;
  deactivated: number;
  unchanged: number;
}

export interface GitHubCliStatus {
  status: "missing" | "unauthenticated" | "ready";
  account: string;
  message: string;
}

export interface AppSettings {
  workbenchRoot: string;
  skillsRoot: string;
  previousSkillsRoot?: string | null;
  closeBehavior: CloseBehavior;
  closeTrayHintDismissed: boolean;
  toolTargets: ToolTarget[];
  projectOpenProfiles: ProjectOpenProfile[];
}

export type CloseBehavior = "exit" | "hide_to_tray";

export interface SkillsState {
  settings: AppSettings;
  skills: Skill[];
  categories: SkillCategory[];
}

export interface ImportResult {
  directoryName: string;
  status: "imported" | "skipped" | "conflict" | "invalid";
  message: string;
}

export type ExternalSkillCandidateStatus = "new" | "same_as_current" | "conflict" | "invalid" | "unreadable";

export interface ExternalSkillCandidateSource {
  tool: ToolKey;
  toolName: string;
  path: string;
  contentHash?: string | null;
  readable: boolean;
  message?: string | null;
}

export interface ExternalSkillCandidateGroup {
  directoryName: string;
  displayName: string;
  description: string;
  status: ExternalSkillCandidateStatus;
  sources: ExternalSkillCandidateSource[];
}

export type ExternalSkillSyncAction = "sync" | "use_workbench" | "use_external" | "skip";
export type ExternalSkillSyncStatus = "synced" | "skipped" | "conflict" | "invalid" | "failed";

export interface ExternalSkillSyncSelection {
  directoryName: string;
  sourcePath: string;
  tool: ToolKey;
  action: ExternalSkillSyncAction;
}

export interface ExternalSkillSyncResult {
  directoryName: string;
  tool: ToolKey;
  toolName: string;
  sourcePath: string;
  status: ExternalSkillSyncStatus;
  syncMethod?: "symlink" | "copy" | null;
  backupPath?: string | null;
  message: string;
}

export interface RootSkillMigrationCandidate {
  directoryName: string;
  displayName: string;
  description: string;
  sourcePath: string;
  status: ExternalSkillCandidateStatus;
  message: string;
}

export type ManagedTargetRebuildStatus = "ready" | "rebuilt" | "skipped" | "conflict" | "invalid";

export interface ManagedTargetRebuildCandidate {
  directoryName: string;
  tool: ToolKey;
  scope: "global" | "project";
  projectName: string;
  projectPath: string;
  linkPath: string;
  syncMethod: "symlink" | "copy";
  status: ManagedTargetRebuildStatus;
  message: string;
}

export interface ManagedTargetRebuildSelection {
  directoryName: string;
  tool: ToolKey;
  scope: "global" | "project";
  projectPath: string;
}

export interface ManagedTargetRebuildResult {
  directoryName: string;
  tool: ToolKey;
  scope: "global" | "project";
  projectPath: string;
  status: ManagedTargetRebuildStatus;
  message: string;
}

export interface SkillsRootMigrationState {
  previousSkillsRoot?: string | null;
  currentSkillsRoot: string;
  canMigrate: boolean;
  candidates: RootSkillMigrationCandidate[];
  managedTargets: ManagedTargetRebuildCandidate[];
}
