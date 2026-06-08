import sys

# test_tool.py
from tools import get_github_file

def test():
    print("Testing get_github_file...\n", file=sys.stderr)

    content = get_github_file(
        "santicam06",
        "OOP-Seneca",
        "OOP345/assignment1/dictionary.cpp?token=GHSAT0AAAAAADSUAWXXE6YCD2K7G3BDYYZY2MPR6RA",
        "refs/heads/main" 
    )

    print(content)

if __name__ == "__main__":
    test()