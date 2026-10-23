CREATE TABLE IF NOT EXISTS posts(
 id TEXT PRIMARY KEY,title TEXT NOT NULL DEFAULT '',body TEXT NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '',
 hashtags TEXT NOT NULL DEFAULT '',link TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',
 platforms TEXT NOT NULL DEFAULT '[]',media TEXT NOT NULL DEFAULT '[]',
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','scheduled','processing','published','failed','cancelled')),
 scheduled_at TEXT,error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,name TEXT NOT NULL,file TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY AUTOINCREMENT,at TEXT NOT NULL,action TEXT NOT NULL,level TEXT NOT NULL DEFAULT 'info',detail TEXT);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status,scheduled_at);
