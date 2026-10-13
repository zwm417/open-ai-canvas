package handler

import (
	"fmt"
	"io"
	"net/http"
	"strings"

	"infinite-canvas/backend/internal/assets"
	"infinite-canvas/backend/internal/service"
	"time"

	"github.com/gin-gonic/gin"
)

func resourceAccessOptions(c *gin.Context) service.ResourceAccessOptions {
	purpose := assets.AccessPurpose(strings.TrimSpace(c.Query("purpose")))
	if purpose == "" && c.Query("download") == "1" {
		purpose = assets.PurposeDownload
	}
	variant := assets.ResourceVariant(strings.TrimSpace(c.Query("variant")))
	return service.ResourceAccessOptions{
		Purpose:      purpose,
		Variant:      variant,
		DescribeOnly: c.Query("access") == "1",
	}
}

// serveResourceDelivery is the only HTTP byte/redirect executor. Authorization and
// delivery selection happen in app; this function only applies the already-resolved
// contract to an HTTP response.
func serveResourceDelivery(c *gin.Context, delivery *service.ResourceDelivery, cacheControl string, disposition string) {
	if delivery == nil || delivery.Access == nil {
		fail(c, http.StatusServiceUnavailable, fmt.Errorf("资源分发结果无效"))
		return
	}
	access := delivery.Access
	if access.URL == "" && delivery.Stream == nil {
		fail(c, http.StatusServiceUnavailable, fmt.Errorf("资源分发结果无效"))
		return
	}
	if c.Query("access") == "1" {
		c.Header("Cache-Control", "private, no-store")
		c.Header("Referrer-Policy", "no-referrer")
		ok(c, gin.H{"access": access})
		return
	}
	c.Header("Referrer-Policy", "no-referrer")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Accept-Ranges", "bytes")
	if access.Delivery == assets.DeliveryCDN || access.Delivery == assets.DeliveryOrigin {
		// @opc-adapter: fast-media-redirect-cache [start]
		redirectCache := cacheControl
		if redirectCache == "" || redirectCache == "private, no-cache" {
			maxAge := 300
			if access.ExpiresAt != nil {
				rem := int(time.Until(*access.ExpiresAt).Seconds())
				// 留 20% 余量防止客户端临界重试时遇到 OSS 403 签名过期
				safeTTL := int(float64(rem) * 0.8)
				if safeTTL > 240 {
					safeTTL = 240
				}
				if safeTTL < 15 {
					safeTTL = 0
				}
				maxAge = safeTTL
			}
			if maxAge > 0 {
				redirectCache = fmt.Sprintf("private, max-age=%d", maxAge)
			} else {
				redirectCache = "private, no-cache"
			}
		}
		c.Header("Cache-Control", redirectCache)
		// @opc-adapter: fast-media-redirect-cache [end]
		// Do not let Gin generate its default HTML redirect body. A media request
		// should transfer only the redirect metadata; the actual bytes must be
		// fetched from the CDN/origin selected by the access contract.
		c.Header("Location", access.URL)
		c.Status(http.StatusTemporaryRedirect)
		return
	}
	stream := delivery.Stream
	if stream == nil || stream.Body == nil {
		fail(c, http.StatusServiceUnavailable, fmt.Errorf("资源流不可用"))
		return
	}
	defer stream.Body.Close()
	if cacheControl != "" {
		c.Header("Cache-Control", cacheControl)
	}
	if disposition != "" {
		c.Header("Content-Disposition", disposition)
	}
	resource := stream.Resource
	mimeType := resource.MimeType
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	if stream.ContentRange != "" {
		c.Header("Content-Range", stream.ContentRange)
	}
	if stream.AcceptRanges != "" {
		c.Header("Accept-Ranges", stream.AcceptRanges)
	}
	if seeker, ok := stream.Body.(io.ReadSeeker); ok {
		c.Header("Content-Type", mimeType)
		http.ServeContent(c.Writer, c.Request, resource.ID, resource.UpdatedAt, seeker)
		return
	}
	c.DataFromReader(stream.StatusCode, stream.ContentLength, mimeType, stream.Body, nil)
}
