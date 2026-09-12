# Fixture paper source

This file exists only so `newestSourceDate` finds something. Its mtime is whenever the
repo was checked out, which is always later than the 2026-01-01 dates in the fixture's
CONTINUOUS rows — so the `stale-continuous` check fires deterministically without the
test having to touch mtimes.
