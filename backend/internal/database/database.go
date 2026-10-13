package database

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"infinite-canvas/backend/internal/logging"

	"gorm.io/driver/postgres"
	// @opc-adapter: pure-go-sqlite [start]
	"github.com/glebarez/sqlite"
	// @opc-adapter: pure-go-sqlite [end]
	"gorm.io/gorm"
)

type Config struct {
	Driver  string
	DSN     string
	DataDir string
}

func Open(config Config) (*gorm.DB, error) {
	driver := strings.ToLower(strings.TrimSpace(config.Driver))
	if driver == "" {
		driver = "sqlite"
	}
	switch driver {
	case "sqlite":
		dsn := strings.TrimSpace(config.DSN)
		if dsn == "" {
			if err := os.MkdirAll(config.DataDir, 0o755); err != nil {
				return nil, err
			}
			dsn = config.DataDir + "/open_ai_canvas.db"
		}
		dsn = normalizeSqliteDSN(dsn)
		db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{Logger: logging.GormLogger()})
		if err != nil {
			return nil, err
		}
		// @opc-adapter: sqlite-wal-concurrency [start]
		if !strings.Contains(dsn, ":memory:") && !strings.Contains(dsn, "mode=memory") {
			_ = db.Exec("PRAGMA journal_mode = WAL;").Error
			_ = db.Exec("PRAGMA busy_timeout = 10000;").Error
			_ = db.Exec("PRAGMA synchronous = NORMAL;").Error
			_ = db.Exec("PRAGMA foreign_keys = ON;").Error
		}
		// @opc-adapter: sqlite-wal-concurrency [end]
		return db, nil
	case "postgres", "postgresql":
		dsn := strings.TrimSpace(config.DSN)
		if dsn == "" {
			return nil, errors.New("PostgreSQL 模式必须配置 DATABASE_URL")
		}
		return gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logging.GormLogger()})
	default:
		return nil, fmt.Errorf("不支持的数据库驱动：%s", driver)
	}
}

func normalizeSqliteDSN(dsn string) string {
	dsn = strings.TrimSpace(dsn)
	if dsn == ":memory:" || strings.Contains(dsn, "mode=memory") {
		if !strings.Contains(dsn, "busy_timeout") {
			delimiter := "?"
			if strings.Contains(dsn, "?") {
				delimiter = "&"
			}
			dsn += delimiter + "_pragma=busy_timeout(10000)&_busy_timeout=10000"
		}
		return dsn
	}
	var params []string
	if !strings.Contains(dsn, "busy_timeout") {
		params = append(params, "_pragma=busy_timeout(10000)", "_busy_timeout=10000")
	}
	if !strings.Contains(dsn, "journal_mode") {
		params = append(params, "_pragma=journal_mode(WAL)", "_journal_mode=WAL")
	}
	if !strings.Contains(dsn, "foreign_keys") {
		params = append(params, "_pragma=foreign_keys(1)", "_foreign_keys=on")
	}
	if !strings.Contains(dsn, "synchronous") {
		params = append(params, "_pragma=synchronous(NORMAL)", "_synchronous=NORMAL")
	}
	if !strings.Contains(dsn, "_txlock") {
		params = append(params, "_txlock=immediate")
	}
	if len(params) > 0 {
		delimiter := "?"
		if strings.Contains(dsn, "?") {
			delimiter = "&"
		}
		dsn += delimiter + strings.Join(params, "&")
	}
	return dsn
}

func ConfigurePool(db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	if db.Dialector.Name() == "postgres" {
		sqlDB.SetMaxOpenConns(30)
		sqlDB.SetMaxIdleConns(10)
		return nil
	}
	sqlDB.SetMaxOpenConns(8)
	sqlDB.SetMaxIdleConns(4)
	return nil
}
