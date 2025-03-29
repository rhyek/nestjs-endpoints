#!/bin/bash
set -e
__dirname=$(realpath "$(dirname "$0")")

# Function to extract changelog entry for a specific version
extract_changelog_entry() {
  local version=$1
  local changelog_file="$__dirname/../CHANGELOG.md"
  
  # Check if changelog file exists
  if [ ! -f "$changelog_file" ]; then
    echo "Error: Changelog file not found at $changelog_file" >&2
    exit 1
  fi
  
  # Extract the entry for the specified version
  local entry=$(awk -v version="## $version" '
    BEGIN { found=0; printing=0; }
    $0 ~ version { found=1; printing=0; next; }
    found && !printing && /^###/ { printing=1; }
    printing && /^## [0-9]+\.[0-9]+\.[0-9]+/ { printing=0; exit; }
    printing { print }
    END { if (!found) exit 1 }
  ' "$changelog_file")
  
  if [ $? -ne 0 ]; then
    echo "Error: Version $version not found in changelog" >&2
    exit 1
  fi
  
  # Output the entry to stdout
  echo "$entry"
}

# Check if version argument is provided
if [ $# -ne 1 ]; then
  echo "Usage: $0 <version>" >&2
  echo "Example: $0 1.1.0" >&2
  exit 1
fi

# Extract and print the changelog entry
extract_changelog_entry "$1"
