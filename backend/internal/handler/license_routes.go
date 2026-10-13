package handler

import (
	"net/http"
	"strings"

	"infinite-canvas/backend/internal/custom/license"
	"infinite-canvas/backend/internal/service"

	"github.com/gin-gonic/gin"
)

type activateLoginRequest struct {
	ActivationCode string `json:"activationCode"`
	DeviceID       string `json:"deviceId"`
}

type bindLicenseRequest struct {
	ActivationCode string `json:"activationCode"`
	DeviceID       string `json:"deviceId"`
}

// RegisterLicenseRoutes 注册激活码授权相关路由
func RegisterLicenseRoutes(r *gin.RouterGroup, svc *service.Service) {
	licenseSvc := license.NewService(svc.DB())
	group := r.Group("/custom/license")
	{
		// 1. 激活码一键开启 / 自动注册登录（公开路由，无需预先登录）
		group.POST("/activate-login", func(c *gin.Context) {
			var req activateLoginRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "请求参数无效，请检查激活码"})
				return
			}

			code := strings.TrimSpace(req.ActivationCode)
			if code == "" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "请输入激活码"})
				return
			}

			deviceID := strings.TrimSpace(req.DeviceID)
			if deviceID == "" {
				deviceID = "web_" + c.ClientIP()
			}

			result, err := licenseSvc.ActivateAndLogin(c.Request.Context(), code, deviceID, true)
			if err != nil {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": err.Error()})
				return
			}

			// 签发系统标准 HttpOnly Cookie
			setSessionCookie(c, result.Session, result.MaxAgeSecs)

			c.JSON(http.StatusOK, gin.H{
				"code": 0,
				"msg":  "激活成功",
				"data": gin.H{
					"user":          result.User,
					"license":       result.License,
					"isNewUser":     result.IsNewUser,
					"grantedMicros": result.GrantedMicros,
				},
			})
		})

		// 2. 查询当前用户授权状态（需当前登录凭证）
		group.GET("/status", func(c *gin.Context) {
			user, err := currentUser(c, svc)
			if err != nil || user == nil {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "未登录或登录已失效"})
				return
			}

			lic, err := licenseSvc.GetUserLicense(user.ID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "msg": "查询授权信息失败"})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"code": 0,
				"msg":  "ok",
				"data": gin.H{
					"licensed": lic != nil && lic.Status == "active",
					"license":  lic,
				},
			})
		})

		// 3. 已登录用户兑换新激活码续期/升级（需当前登录凭证）
		group.POST("/bind", func(c *gin.Context) {
			user, err := currentUser(c, svc)
			if err != nil || user == nil {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "未登录或登录已失效"})
				return
			}

			var req bindLicenseRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "请求参数无效"})
				return
			}

			code := strings.TrimSpace(req.ActivationCode)
			if code == "" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "请输入激活码"})
				return
			}

			deviceID := strings.TrimSpace(req.DeviceID)
			if deviceID == "" {
				deviceID = "web_" + c.ClientIP()
			}

			lic, err := licenseSvc.BindLicenseToExistingUser(c.Request.Context(), user.ID, code, deviceID)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": err.Error()})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"code": 0,
				"msg":  "激活码兑换成功",
				"data": gin.H{
					"license": lic,
				},
			})
		})
	}
}
