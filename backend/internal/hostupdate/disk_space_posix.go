//go:build !windows

package hostupdate

import (
	"fmt"
	"syscall"
)

// @opc-adapter: cross-platform-disk-space [start]
func checkDiskSpace(path string, requiredBytes int64) error {
	var disk syscall.Statfs_t
	if err := syscall.Statfs(path, &disk); err != nil {
		return fmt.Errorf("检查备份磁盘空间：%w", err)
	}
	available := int64(disk.Bavail) * int64(disk.Bsize)
	if available < requiredBytes {
		return fmt.Errorf("备份目录可用空间不足 2 GiB：当前 %d MiB", available>>20)
	}
	return nil
}
// @opc-adapter: cross-platform-disk-space [end]
