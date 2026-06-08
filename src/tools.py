import sys
import requests
import os 
import hashlib

def get_cache_filename(owner, repo, filepath, ref):

    unique_string = f"{owner}/{repo}/{ref}/{filepath}"

    # Hash the string to create a unique filename
    # SHA256 operates with bytes, not strings so we use encode()
    hash_object = hashlib.sha256(unique_string.encode())
    hexa = hash_object.hexdigest()

    # Path to look for in caller function
    return f".cache/{hexa}.txt"

# ____________________________________________________________________
# @param owner: GitHub username/org
# @param repo: Repository name
# @param filepath: Path to the file
# @param ref: Branch/tag/commit (should default to "main")
# @param maxLines: Maximum lines to return (should default to something reasonable like 500)

# e.g. https://raw.githubusercontent.com/microsoft/vscode/main/src/main.ts

def get_github_file(owner, repo, filepath, ref = "main",  maxLines = 500):
    
    # Check if resource already added in .cache directory
    cache_filename = get_cache_filename(owner, repo, filepath, ref)
    if os.path.exists(cache_filename):
        with open(cache_filename, "r", encoding="utf-8") as f:
            return f.read()

    url = f'https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{filepath}'

    try:
        response = requests.get(url)

        if response.status_code == 404:
            return "ERROR: File not found (404), revise syntax of your URL."
        elif response.status_code == 403:
            return "ERROR: Rate limit exceeded or access forbidden (403)"

        content = response.text

        lines = sum(1 for line in content.splitlines())
        print('Total Number of LINES:', lines, file=sys.stderr)
        lines_list = content.splitlines()
        content = '\n'.join(lines_list)
        
        if lines > maxLines:
            content = '\n'.join(lines_list[:maxLines])
            content += f'\n\n🔴 [FILE TRUNCATED: showing first {maxLines} of {lines} lines]'

        # Ensure .cache directory exists
        os.makedirs(".cache", exist_ok=True)
        # Write to cache
        with open(cache_filename, "w", encoding="utf-8") as f:
            f.write(content)

        return content
    
    except Exception as e:
        return f'An unexpected ERROR occurred: {e}'


# Allow to use the function in command line ONLY executing this script, no other that imports it.
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--owner", required=True)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--filepath", required=True)
    parser.add_argument("--ref", default="main")
    parser.add_argument("--maxLines", type=int, default=500)
    args = parser.parse_args()

    result = get_github_file(
        args.owner,
        args.repo,
        args.filepath,
        args.ref,
        args.maxLines
    )
    print(result)