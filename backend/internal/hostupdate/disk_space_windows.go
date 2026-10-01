//go:build windows

package hostupdate

import (
	"fmt"
	"os"
	"path/filepath"
	"unsafe"

	"golang.org/x/sys/windows"
)

// @opc-adapter: cross-platform-disk-space [start]
func checkDiskSpace(path string, requiredBytes int64) error {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return fmt.Errorf("解析备份磁盘路径：%w", err)
	}

	// 查找最近已存在的父目录
	checkPath := absPath
	for {
		if _, err := os.Stat(checkPath); err == nil {
			break
		}
		parent := filepath.Dir(checkPath)
		if parent == checkPath {
			break
		}
		checkPath = parent
	}

	pathPtr, err := windows.UTF16PtrFromString(checkPath)
	if err != nil {
		return fmt.Errorf("检查备份磁盘空间：%w", err)
	}

	var freeBytesAvailable, totalNumberOfBytes, totalNumberOfFreeBytes int64
	err = windows.GetDiskFreeSpaceEx(
		pathPtr,
		(*uint64)(unsafe.Pointer(&freeBytesAvailable)),
		(*uint64)(unsafe.Pointer(&totalNumberOfBytes)),
		(*uint64)(unsafe.Pointer(&totalNumberOfFreeBytes)),
	)
	if err != nil {
		return fmt.Errorf("检查备份磁盘空间：%w", err)
	}

	if freeBytesAvailable < requiredBytes {
		return fmt.Errorf("备份目录可用空间不足 2 GiB：当前 %d MiB", freeBytesAvailable>>20)
	}
	return nil
}
// @opc-adapter: cross-platform-disk-space [end]
