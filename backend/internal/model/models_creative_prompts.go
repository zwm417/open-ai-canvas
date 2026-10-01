package model

import "time"

// CreativePromptTemplate 表示系统内置与用户自定义的创作提示词模板
type CreativePromptTemplate struct {
	ID        string    `json:"id" gorm:"primaryKey;size:64"`
	UserID    string    `json:"userId" gorm:"size:36;index"` // 为空或 "system" 表示系统内置模板，不为空表示用户个人模板
	Kind      string    `json:"kind" gorm:"size:24;index"`   // "image" (生图提示词) | "video" (生视频提示词) | "drama" (短剧提示词)
	Name      string    `json:"name" gorm:"size:120"`
	Content   string    `json:"content" gorm:"type:text"`
	Category  string    `json:"category" gorm:"size:64;index"`
	Tags      string    `json:"tags" gorm:"size:255"`
	IsBuiltin bool      `json:"isBuiltin" gorm:"index"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
