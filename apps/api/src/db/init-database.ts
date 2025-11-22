import postgres from 'postgres';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// SECURITY: Require DATABASE_URL to be set explicitly (no default password)
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.error('   Please set DATABASE_URL in your .env file');
  console.error('   Example: DATABASE_URL=postgresql://user:password@localhost:5432/database');
  process.exit(1);
}

/**
 * Initialize the database with all required tables and indexes
 * Run this script with: pnpm db:init
 */
async function initDatabase() {
  const sql = postgres(connectionString as string);

  try {
    console.log('🔄 Initializing database schema...');

    // Create users table
    console.log('👤 Creating users table...');
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        hashed_password TEXT,
        name TEXT NOT NULL,
        avatar_url TEXT,
        email_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    // Create sessions table
    console.log('🔑 Creating sessions table...');
    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL
      )
    `;

    // Create workspaces table
    console.log('🏢 Creating workspaces table...');
    await sql`
      CREATE TABLE IF NOT EXISTS workspaces (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        logo_url TEXT,
        settings JSONB DEFAULT '{}'::jsonb,
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    // Create workspace_members table
    console.log('👥 Creating workspace_members table...');
    await sql`
      CREATE TABLE IF NOT EXISTS workspace_members (
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
        joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        PRIMARY KEY (workspace_id, user_id)
      )
    `;

    // Create documents table
    console.log('📄 Creating documents table...');
    await sql`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        parent_id UUID REFERENCES documents(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        icon TEXT,
        cover_url TEXT,
        content JSONB,
        is_archived BOOLEAN DEFAULT FALSE,
        is_published BOOLEAN DEFAULT FALSE,
        published_slug TEXT UNIQUE,
        "order" INTEGER DEFAULT 0,
        created_by UUID NOT NULL REFERENCES users(id),
        last_edited_by UUID REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    // Create document_versions table
    console.log('📚 Creating document_versions table...');
    await sql`
      CREATE TABLE IF NOT EXISTS document_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        content JSONB NOT NULL,
        version_number INTEGER NOT NULL,
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    // Create teams table
    console.log('👥 Creating teams table...');
    await sql`
      CREATE TABLE IF NOT EXISTS teams (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        color TEXT,
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    // Create team_members table
    console.log('👤 Creating team_members table...');
    await sql`
      CREATE TABLE IF NOT EXISTS team_members (
        team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT DEFAULT 'member' NOT NULL CHECK (role IN ('leader', 'member')),
        joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        PRIMARY KEY (team_id, user_id)
      )
    `;

    // Create projects table
    console.log('📋 Creating projects table...');
    await sql`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        color TEXT,
        view_type TEXT DEFAULT 'list' CHECK (view_type IN ('list', 'board', 'calendar', 'table', 'timeline')),
        settings JSONB DEFAULT '{}'::jsonb,
        is_archived BOOLEAN DEFAULT FALSE,
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    // Create project_teams table (many-to-many)
    console.log('🔗 Creating project_teams table...');
    await sql`
      CREATE TABLE IF NOT EXISTS project_teams (
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        PRIMARY KEY (project_id, team_id)
      )
    `;

    // Create task_templates table (must be created before tasks table)
    console.log('📋 Creating task_templates table...');
    await sql`
      CREATE TABLE IF NOT EXISTS task_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        title TEXT,
        description_template TEXT,
        priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
        checklists JSONB DEFAULT '[]'::jsonb,
        cover_url TEXT,
        icon TEXT,
        is_public BOOLEAN DEFAULT FALSE,
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    // Create tasks table
    console.log('✅ Creating tasks table...');
    await sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
        priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        assignee_id UUID REFERENCES users(id),
        due_date TIMESTAMP WITH TIME ZONE,
        tags JSONB DEFAULT '[]'::jsonb,
        cover_url TEXT,
        checklists JSONB DEFAULT '[]'::jsonb,
        "order" INTEGER DEFAULT 0,
        parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
        template_id UUID REFERENCES task_templates(id) ON DELETE SET NULL,
        created_by UUID NOT NULL REFERENCES users(id),
        completed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    // Create events table
    console.log('📅 Creating events table...');
    await sql`
      CREATE TABLE IF NOT EXISTS events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        date TIMESTAMP WITH TIME ZONE NOT NULL,
        priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    // Create task_columns table
    console.log('📊 Creating task_columns table...');
    await sql`
      CREATE TABLE IF NOT EXISTS task_columns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        color TEXT NOT NULL,
        "order" INTEGER DEFAULT 0,
        status_id TEXT,
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    // Create task_attachments table
    console.log('📎 Creating task_attachments table...');
    await sql`
      CREATE TABLE IF NOT EXISTS task_attachments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL,
        file_url TEXT NOT NULL,
        file_size INTEGER,
        mime_type TEXT,
        uploaded_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    // Create task_tags table
    console.log('🏷️ Creating task_tags table...');
    await sql`
      CREATE TABLE IF NOT EXISTS task_tags (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    // Create task_tag_relations table
    console.log('🔗 Creating task_tag_relations table...');
    await sql`
      CREATE TABLE IF NOT EXISTS task_tag_relations (
        task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        tag_id UUID NOT NULL REFERENCES task_tags(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        PRIMARY KEY (task_id, tag_id)
      )
    `;

    // Create comments table
    console.log('💬 Creating comments table...');
    await sql`
      CREATE TABLE IF NOT EXISTS comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        content TEXT NOT NULL,
        document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
        task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
        parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
        created_by UUID NOT NULL REFERENCES users(id),
        is_resolved BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    // Create wiki page comments table
    console.log('🗨️ Creating wiki_page_comments table...');
    await sql`
      CREATE TABLE IF NOT EXISTS wiki_page_comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        page_id UUID NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        is_resolved BOOLEAN DEFAULT FALSE,
        created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS wiki_page_comments_page_idx ON wiki_page_comments(page_id)`;
    await sql`CREATE INDEX IF NOT EXISTS wiki_page_comments_created_by_idx ON wiki_page_comments(created_by)`;
    await sql`CREATE INDEX IF NOT EXISTS wiki_page_comments_resolved_by_idx ON wiki_page_comments(resolved_by)`;

    // Create database_schemas table
    console.log('🗄️ Creating database_schemas table...');
    await sql`
      CREATE TABLE IF NOT EXISTS database_schemas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        properties JSONB NOT NULL,
        views JSONB DEFAULT '[]'::jsonb,
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    // Create database_entries table
    console.log('📊 Creating database_entries table...');
    await sql`
      CREATE TABLE IF NOT EXISTS database_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        schema_id UUID NOT NULL REFERENCES database_schemas(id) ON DELETE CASCADE,
        data JSONB NOT NULL,
        "order" INTEGER DEFAULT 0,
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    // Create notification_preferences table
    console.log('⚙️ Creating notification_preferences table...');
    await sql`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        email_enabled BOOLEAN DEFAULT TRUE,
        email_mentions BOOLEAN DEFAULT TRUE,
        email_comments BOOLEAN DEFAULT TRUE,
        email_tasks BOOLEAN DEFAULT TRUE,
        email_digest TEXT DEFAULT 'daily' CHECK (email_digest IN ('none', 'daily', 'weekly')),
        in_app_mentions BOOLEAN DEFAULT TRUE,
        in_app_comments BOOLEAN DEFAULT TRUE,
        in_app_tasks BOOLEAN DEFAULT TRUE,
        in_app_documents BOOLEAN DEFAULT TRUE,
        push_enabled BOOLEAN DEFAULT FALSE,
        push_subscription JSONB,
        sound_enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    // Create notifications table
    console.log('🔔 Creating notifications table...');
    await sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT,
        action_url TEXT,
        workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
        document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
        task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
        comment_id UUID,
        metadata JSONB,
        is_read BOOLEAN DEFAULT FALSE,
        read_at TIMESTAMP WITH TIME ZONE,
        is_archived BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    // Create templates table
    console.log('📝 Creating templates table...');
    await sql`
      CREATE TABLE IF NOT EXISTS templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
        created_by UUID NOT NULL REFERENCES users(id),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(50) NOT NULL,
        icon VARCHAR(50),
        cover_image TEXT,
        content JSONB,
        structure JSONB,
        properties JSONB,
        settings JSONB,
        tags TEXT[],
        is_public BOOLEAN DEFAULT FALSE,
        is_official BOOLEAN DEFAULT FALSE,
        usage_count INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    // Create template_gallery table
    console.log('🖼️ Creating template_gallery table...');
    await sql`
      CREATE TABLE IF NOT EXISTS template_gallery (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        thumbnail TEXT,
        screenshots TEXT[],
        downloads INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        rating NUMERIC(3,2),
        published_by UUID NOT NULL REFERENCES users(id),
        published_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        category VARCHAR(50) NOT NULL,
        tags TEXT[],
        featured BOOLEAN DEFAULT FALSE
      )
    `;

    // Create favorite_templates table
    console.log('⭐ Creating favorite_templates table...');
    await sql`
      CREATE TABLE IF NOT EXISTS favorite_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
        added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    // Create drive_folders table
    console.log('📁 Creating drive_folders table...');
    await sql`
      CREATE TABLE IF NOT EXISTS drive_folders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        parent_id UUID REFERENCES drive_folders(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        folder_type TEXT DEFAULT 'general' CHECK (folder_type IN ('general', 'tasks', 'documents', 'calendar', 'custom')),
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    // Create drive_files table
    console.log('📄 Creating drive_files table...');
    await sql`
      CREATE TABLE IF NOT EXISTS drive_files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        folder_id UUID REFERENCES drive_folders(id) ON DELETE SET NULL,
        file_name TEXT NOT NULL,
        file_url TEXT NOT NULL,
        file_key TEXT NOT NULL,
        file_size INTEGER,
        mime_type TEXT,
        file_type TEXT DEFAULT 'general' CHECK (file_type IN ('document', 'task-attachment', 'calendar', 'general')),
        document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
        task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
        uploaded_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    // Create indexes for better performance
    console.log('🔍 Creating indexes...');

    // User indexes
    await sql`CREATE INDEX IF NOT EXISTS users_email_idx ON users(email)`;

    // Session indexes
    await sql`CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)`;

    // Workspace indexes
    await sql`CREATE INDEX IF NOT EXISTS workspaces_slug_idx ON workspaces(slug)`;
    await sql`CREATE INDEX IF NOT EXISTS workspaces_created_by_idx ON workspaces(created_by)`;

    // Workspace members indexes
    await sql`CREATE INDEX IF NOT EXISTS workspace_members_workspace_idx ON workspace_members(workspace_id)`;
    await sql`CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members(user_id)`;

    // Document indexes
    await sql`CREATE INDEX IF NOT EXISTS documents_workspace_idx ON documents(workspace_id)`;
    await sql`CREATE INDEX IF NOT EXISTS documents_parent_idx ON documents(parent_id)`;
    await sql`CREATE INDEX IF NOT EXISTS documents_published_slug_idx ON documents(published_slug)`;
    await sql`CREATE INDEX IF NOT EXISTS documents_archived_idx ON documents(is_archived)`;
    await sql`CREATE INDEX IF NOT EXISTS documents_created_by_idx ON documents(created_by)`;

    // Document versions indexes
    await sql`CREATE INDEX IF NOT EXISTS document_versions_document_idx ON document_versions(document_id)`;
    await sql`CREATE INDEX IF NOT EXISTS document_versions_version_idx ON document_versions(document_id, version_number)`;

    // Project indexes
    // Teams indexes
    await sql`CREATE INDEX IF NOT EXISTS teams_workspace_idx ON teams(workspace_id)`;
    await sql`CREATE INDEX IF NOT EXISTS teams_created_by_idx ON teams(created_by)`;

    // Team members indexes
    await sql`CREATE INDEX IF NOT EXISTS team_members_team_idx ON team_members(team_id)`;
    await sql`CREATE INDEX IF NOT EXISTS team_members_user_idx ON team_members(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS team_members_team_user_idx ON team_members(team_id, user_id)`;

    // Projects indexes
    await sql`CREATE INDEX IF NOT EXISTS projects_workspace_idx ON projects(workspace_id)`;
    await sql`CREATE INDEX IF NOT EXISTS projects_user_idx ON projects(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS projects_created_by_idx ON projects(created_by)`;

    // Project teams indexes
    await sql`CREATE INDEX IF NOT EXISTS project_teams_project_idx ON project_teams(project_id)`;
    await sql`CREATE INDEX IF NOT EXISTS project_teams_team_idx ON project_teams(team_id)`;

    // Task indexes
    await sql`CREATE INDEX IF NOT EXISTS tasks_workspace_idx ON tasks(workspace_id)`;
    await sql`CREATE INDEX IF NOT EXISTS tasks_project_idx ON tasks(project_id)`;
    await sql`CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON tasks(assignee_id)`;
    await sql`CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status)`;
    await sql`CREATE INDEX IF NOT EXISTS tasks_parent_idx ON tasks(parent_task_id)`;
    await sql`CREATE INDEX IF NOT EXISTS tasks_template_idx ON tasks(template_id)`;
    await sql`CREATE INDEX IF NOT EXISTS tasks_workspace_status_idx ON tasks(workspace_id, status)`;
    await sql`CREATE INDEX IF NOT EXISTS tasks_project_status_idx ON tasks(project_id, status)`;

    // Event indexes
    await sql`CREATE INDEX IF NOT EXISTS events_workspace_idx ON events(workspace_id)`;
    await sql`CREATE INDEX IF NOT EXISTS events_date_idx ON events(date)`;
    await sql`CREATE INDEX IF NOT EXISTS events_status_idx ON events(status)`;
    await sql`CREATE INDEX IF NOT EXISTS events_workspace_date_idx ON events(workspace_id, date)`;

    // Task columns indexes
    await sql`CREATE INDEX IF NOT EXISTS task_columns_workspace_idx ON task_columns(workspace_id)`;
    await sql`CREATE INDEX IF NOT EXISTS task_columns_order_idx ON task_columns(workspace_id, "order")`;
    await sql`CREATE INDEX IF NOT EXISTS task_columns_status_id_idx ON task_columns(status_id)`;
    await sql`CREATE INDEX IF NOT EXISTS task_columns_workspace_status_id_idx ON task_columns(workspace_id, status_id)`;

    // Task templates indexes
    await sql`CREATE INDEX IF NOT EXISTS task_templates_workspace_idx ON task_templates(workspace_id)`;
    await sql`CREATE INDEX IF NOT EXISTS task_templates_created_by_idx ON task_templates(created_by)`;

    // Task attachments indexes
    await sql`CREATE INDEX IF NOT EXISTS task_attachments_task_idx ON task_attachments(task_id)`;
    await sql`CREATE INDEX IF NOT EXISTS task_attachments_uploaded_by_idx ON task_attachments(uploaded_by)`;

    // Task tags indexes
    await sql`CREATE INDEX IF NOT EXISTS task_tags_workspace_idx ON task_tags(workspace_id)`;
    await sql`CREATE INDEX IF NOT EXISTS task_tags_name_idx ON task_tags(name)`;
    await sql`CREATE INDEX IF NOT EXISTS task_tags_workspace_name_idx ON task_tags(workspace_id, name)`;

    // Task tag relations indexes
    await sql`CREATE INDEX IF NOT EXISTS task_tag_relations_task_idx ON task_tag_relations(task_id)`;
    await sql`CREATE INDEX IF NOT EXISTS task_tag_relations_tag_idx ON task_tag_relations(tag_id)`;

    // Comment indexes
    await sql`CREATE INDEX IF NOT EXISTS comments_document_idx ON comments(document_id)`;
    await sql`CREATE INDEX IF NOT EXISTS comments_task_idx ON comments(task_id)`;
    await sql`CREATE INDEX IF NOT EXISTS comments_created_by_idx ON comments(created_by)`;
    await sql`CREATE INDEX IF NOT EXISTS comments_parent_idx ON comments(parent_comment_id)`;

    // Database schemas indexes
    await sql`CREATE INDEX IF NOT EXISTS database_schemas_workspace_idx ON database_schemas(workspace_id)`;
    await sql`CREATE INDEX IF NOT EXISTS database_schemas_document_idx ON database_schemas(document_id)`;

    // Database entries indexes
    await sql`CREATE INDEX IF NOT EXISTS database_entries_schema_idx ON database_entries(schema_id)`;

    // Notification indexes
    await sql`CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications(recipient_id)`;
    await sql`CREATE INDEX IF NOT EXISTS notifications_type_idx ON notifications(type)`;
    await sql`CREATE INDEX IF NOT EXISTS notifications_is_read_idx ON notifications(is_read)`;
    await sql`CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications(created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS notifications_recipient_read_idx ON notifications(recipient_id, is_read, is_archived)`;

    // Drive folders indexes
    await sql`CREATE INDEX IF NOT EXISTS drive_folders_workspace_idx ON drive_folders(workspace_id)`;
    await sql`CREATE INDEX IF NOT EXISTS drive_folders_project_idx ON drive_folders(project_id)`;
    await sql`CREATE INDEX IF NOT EXISTS drive_folders_parent_idx ON drive_folders(parent_id)`;
    await sql`CREATE INDEX IF NOT EXISTS drive_folders_type_idx ON drive_folders(folder_type)`;

    // Drive files indexes
    await sql`CREATE INDEX IF NOT EXISTS drive_files_workspace_idx ON drive_files(workspace_id)`;
    await sql`CREATE INDEX IF NOT EXISTS drive_files_project_idx ON drive_files(project_id)`;
    await sql`CREATE INDEX IF NOT EXISTS drive_files_folder_idx ON drive_files(folder_id)`;
    await sql`CREATE INDEX IF NOT EXISTS drive_files_document_idx ON drive_files(document_id)`;
    await sql`CREATE INDEX IF NOT EXISTS drive_files_task_idx ON drive_files(task_id)`;
    await sql`CREATE INDEX IF NOT EXISTS drive_files_type_idx ON drive_files(file_type)`;

    // Create notes table
    console.log('📝 Creating notes table...');
    await sql`
      CREATE TABLE IF NOT EXISTS notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        content TEXT,
        tags TEXT[],
        color TEXT,
        is_pinned BOOLEAN DEFAULT FALSE,
        is_archived BOOLEAN DEFAULT FALSE,
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS notes_workspace_idx ON notes(workspace_id)`;
    await sql`CREATE INDEX IF NOT EXISTS notes_project_idx ON notes(project_id)`;
    await sql`CREATE INDEX IF NOT EXISTS notes_user_idx ON notes(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS notes_created_by_idx ON notes(created_by)`;
    await sql`CREATE INDEX IF NOT EXISTS notes_archived_idx ON notes(is_archived)`;
    await sql`CREATE INDEX IF NOT EXISTS notes_pinned_idx ON notes(is_pinned)`;

    // Create wiki_pages table
    console.log('📚 Creating wiki_pages table...');
    await sql`
      CREATE TABLE IF NOT EXISTS wiki_pages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        parent_id UUID REFERENCES wiki_pages(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        content JSONB,
        excerpt TEXT,
        icon TEXT,
        cover_url TEXT,
        is_published BOOLEAN DEFAULT TRUE,
        is_archived BOOLEAN DEFAULT FALSE,
        "order" INTEGER DEFAULT 0,
        created_by UUID NOT NULL REFERENCES users(id),
        last_edited_by UUID REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS wiki_pages_workspace_idx ON wiki_pages(workspace_id)`;
    await sql`CREATE INDEX IF NOT EXISTS wiki_pages_project_idx ON wiki_pages(project_id)`;
    await sql`CREATE INDEX IF NOT EXISTS wiki_pages_parent_idx ON wiki_pages(parent_id)`;
    await sql`CREATE INDEX IF NOT EXISTS wiki_pages_slug_idx ON wiki_pages(slug)`;
    await sql`CREATE INDEX IF NOT EXISTS wiki_pages_workspace_slug_idx ON wiki_pages(workspace_id, slug)`;
    await sql`CREATE INDEX IF NOT EXISTS wiki_pages_archived_idx ON wiki_pages(is_archived)`;

    // Create wiki_page_links table
    console.log('🔗 Creating wiki_page_links table...');
    await sql`
      CREATE TABLE IF NOT EXISTS wiki_page_links (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        from_page_id UUID NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
        to_page_id UUID NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS wiki_page_links_from_idx ON wiki_page_links(from_page_id)`;
    await sql`CREATE INDEX IF NOT EXISTS wiki_page_links_to_idx ON wiki_page_links(to_page_id)`;
    await sql`CREATE INDEX IF NOT EXISTS wiki_page_links_unique_idx ON wiki_page_links(from_page_id, to_page_id)`;

    // Add tags column to wiki_pages table
    console.log('🏷️ Adding tags to wiki_pages...');
    await sql`ALTER TABLE wiki_pages ADD COLUMN IF NOT EXISTS tags TEXT[]`;

    // Add additional indexes to wiki_pages for better performance
    await sql`CREATE INDEX IF NOT EXISTS wiki_pages_workspace_archived_idx ON wiki_pages(workspace_id, is_archived)`;
    await sql`CREATE INDEX IF NOT EXISTS wiki_pages_workspace_project_idx ON wiki_pages(workspace_id, project_id)`;
    await sql`CREATE INDEX IF NOT EXISTS wiki_pages_updated_at_idx ON wiki_pages(updated_at)`;

    // Create wiki_page_versions table for version history
    console.log('📖 Creating wiki_page_versions table...');
    await sql`
      CREATE TABLE IF NOT EXISTS wiki_page_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        page_id UUID NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        content JSONB,
        excerpt TEXT,
        version_number INTEGER NOT NULL,
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS wiki_page_versions_page_idx ON wiki_page_versions(page_id)`;
    await sql`CREATE INDEX IF NOT EXISTS wiki_page_versions_version_idx ON wiki_page_versions(page_id, version_number)`;

    // Create wiki_page_views table for analytics
    console.log('📊 Creating wiki_page_views table...');
    await sql`
      CREATE TABLE IF NOT EXISTS wiki_page_views (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        page_id UUID NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        ip_address TEXT,
        user_agent TEXT
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS wiki_page_views_page_idx ON wiki_page_views(page_id)`;
    await sql`CREATE INDEX IF NOT EXISTS wiki_page_views_user_idx ON wiki_page_views(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS wiki_page_views_viewed_at_idx ON wiki_page_views(viewed_at)`;

    console.log('✅ Database initialized successfully!');
    console.log('📊 Tables created:');
    console.log('   - users');
    console.log('   - sessions');
    console.log('   - workspaces');
    console.log('   - workspace_members');
    console.log('   - teams');
    console.log('   - team_members');
    console.log('   - projects');
    console.log('   - project_teams');
    console.log('   - documents');
    console.log('   - document_versions');
    console.log('   - task_templates');
    console.log('   - tasks');
    console.log('   - events');
    console.log('   - task_columns');
    console.log('   - task_attachments');
    console.log('   - task_tags');
    console.log('   - task_tag_relations');
    console.log('   - comments');
    console.log('   - database_schemas');
    console.log('   - database_entries');
    console.log('   - notifications');
    console.log('   - notification_preferences');
    console.log('   - templates');
    console.log('   - template_gallery');
    console.log('   - favorite_templates');
    console.log('   - drive_folders');
    console.log('   - drive_files');
    console.log('   - notes');
    console.log('   - wiki_pages');
    console.log('   - wiki_page_comments');
    console.log('   - wiki_page_links');
    console.log('   - wiki_page_versions');
    console.log('   - wiki_page_views');

  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

// Export function for use in other scripts
export { initDatabase };

// Run the initialization if called directly
const isMainModule = process.argv[1] && (
  process.argv[1].includes('init-database') ||
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))
);

if (isMainModule) {
  initDatabase()
    .then(() => {
      console.log('Database initialization script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Database initialization script failed', error);
      process.exit(1);
    });
}