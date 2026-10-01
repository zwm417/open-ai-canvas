package model

import (
	"time"
)

// @opc-adapter: generation-log-model [start]

// GenerationLog 保存生图工作台与视频创作台的生成历史与创作会话快照。
type GenerationLog struct {
	ID           string    `json:"id" gorm:"primaryKey;size:36"`
	UserID       string    `json:"userId" gorm:"index;size:36;index:idx_gen_logs_user_kind_created,priority:1"`
	Kind         string    `json:"kind" gorm:"size:24;index:idx_gen_logs_user_kind_created,priority:2"` // "image" | "video"
	Title        string    `json:"title" gorm:"size:255"`
	Prompt       string    `json:"prompt" gorm:"type:text"`
	Model        string    `json:"model" gorm:"size:120"`
	Status       string    `json:"status" gorm:"size:24"` // "success" | "failed"
	DurationMs   int64     `json:"durationMs"`
	SuccessCount int       `json:"successCount"`
	FailCount    int       `json:"failCount"`
	ItemCount    int       `json:"itemCount"`
	ConfigJSON   string    `json:"configJson" gorm:"type:text"`
	PayloadJSON  string    `json:"payloadJson" gorm:"type:text"`
	CreatedAt    time.Time `json:"createdAt" gorm:"index:idx_gen_logs_user_kind_created,priority:3"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// @opc-adapter: generation-log-model [end]
