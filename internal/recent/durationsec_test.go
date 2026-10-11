package recent

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A media-server track replayed from Recently played showed no progress bar,
// while the same track started from the Library did (#845). The speaker only
// reports a total when the play hands it the length, and the ring kept none,
// so every replay sent 0. The entry now carries the length of its replay URL.

func TestDurationSecSurvivesFlushAndLoad(t *testing.T) {
	path := filepath.Join(t.TempDir(), "recent.json")
	s, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	s.Add(Entry{Source: "upnp", CardKey: "http://nas/1.flac", CardName: "Song", CardURL: "http://nas/1.flac", Mime: "audio/flac", DurationSec: 245})
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}
	re, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	got := re.All()
	if len(got) != 1 || got[0].DurationSec != 245 {
		t.Fatalf("reloaded = %+v, want one entry with DurationSec 245", got)
	}
}

func TestOldFileWithoutDurationSecStillLoads(t *testing.T) {
	path := filepath.Join(t.TempDir(), "recent.json")
	old := `{"recent":[{"ts":"2026-10-01T10:00:00Z","source":"upnp","cardKey":"http://nas/1.mp3","cardName":"Song","cardURL":"http://nas/1.mp3","mime":"audio/mpeg"}]}`
	if err := os.WriteFile(path, []byte(old), 0o644); err != nil {
		t.Fatal(err)
	}
	s, err := Load(path)
	if err != nil {
		t.Fatalf("old file failed to load: %v", err)
	}
	got := s.All()
	if len(got) != 1 || got[0].DurationSec != 0 || got[0].Mime != "audio/mpeg" {
		t.Fatalf("loaded = %+v, want the old entry with an unknown (0) length", got)
	}
}

func TestUnknownDurationIsNotWritten(t *testing.T) {
	path := filepath.Join(t.TempDir(), "recent.json")
	s, _ := Load(path)
	s.Add(Entry{Source: "radio", CardKey: "st|NDR2", CardName: "NDR2", CardURL: "http://stream/ndr2"})
	if err := s.Flush(); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(b), "durationSec") {
		t.Fatalf("a radio entry wrote a length field: %s", b)
	}
}

// A card first written without a length (every card from before #845) heals
// when the same file is played again with one, like the Mime fold (#817).
func TestAFoldFillsTheDurationItWasMissing(t *testing.T) {
	s := New()
	s.Add(Entry{Source: "upnp", CardKey: "http://nas/1.flac", CardURL: "http://nas/1.flac", Mime: "audio/flac"})
	s.Add(Entry{Source: "upnp", CardKey: "http://nas/1.flac", CardURL: "http://nas/1.flac", Mime: "audio/flac", DurationSec: 245})
	got := s.All()
	if len(got) != 1 || got[0].DurationSec != 245 {
		t.Fatalf("got %+v, want the length filled into the folded row", got)
	}
}
