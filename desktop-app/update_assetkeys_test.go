package main

import (
	"slices"
	"testing"
)

// An ARM64 Linux app updating itself from the x86_64 archive would replace
// itself with a binary it cannot run, so each architecture gets its own key and
// ARM64 has no fallback.
func TestUpdateAssetKeysLinuxByArch(t *testing.T) {
	cases := []struct {
		arch string
		want []string
	}{
		{"amd64", []string{"desktop_linux"}},
		{"arm64", []string{"desktop_linux_arm64"}},
	}
	for _, c := range cases {
		if got := updateAssetKeysFor("linux", c.arch); !slices.Equal(got, c.want) {
			t.Errorf("linux/%s: got %v, want %v", c.arch, got, c.want)
		}
	}
	if got := updateAssetKeysFor("windows", "amd64"); !slices.Equal(got, []string{"desktop_windows"}) {
		t.Errorf("windows: got %v", got)
	}
}
