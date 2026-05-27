var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();
const openai = new OpenAI({
    // Override the baseURL so that we use OpenRouter's API vs. OpenAI
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
});
function confirmURL(url) {
    const prefix = "https://github.com/";
    if (url.startsWith(prefix)) {
        const parts = url.substring(prefix.length).split("/");
        if (parts.length >= 4 && parts[2] === "pull") {
            const owner = parts[0];
            const repo = parts[1];
            if (!owner || !repo || !parts[3]) {
                throw new Error("Invalid PR URL format, check the path.");
            }
            const pullNumber = parseInt(parts[3], 10);
            return { owner, repo, pullNumber };
        }
    }
    console.error("URL is not a valid GitHub PR, please check.");
    process.exit(1);
}
function fetchComments(owner, repo, issueNum) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNum}/comments`;
        const response = yield fetch(url, {
            headers: {
                'User-Agent': 'AIP444-Lab-03', //  GitHub requires app identity
                Accept: 'application/vnd.github+json', //  Ensures GitHub's JSON format
                'X-GitHub-Api-Version': '2022-11-28', //  Ensures API stability
            },
        });
        if (!response.ok) {
            throw new Error(`GitHub API Error: ${response.statusText}`);
        }
        const data = yield response.json();
        // Extract only the fields we need
        return data.map((item) => ({
            username: item.user.login,
            body: item.body,
            date: item.updated_at,
        }));
    });
}
const url = process.argv[2];
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        try {
            if (!url) {
                console.error("No URL provided. try: node pr-explain.js <GitHub PR URL>");
                process.exit(1);
            }
            const { owner, repo, pullNumber } = confirmURL(url);
            console.log(`Owner: ${owner}`);
            console.log(`Repo: ${repo}`);
            console.log(`Pull Req. Number: ${pullNumber}`);
            const patchUrl = url + ".patch";
            const response = yield fetch(patchUrl);
            if (!response.ok)
                throw new Error(`Failed to fetch: ${response.statusText}`);
            let text = yield response.text();
            console.log(`TOTAL CHARACTERS IN PATCH: ${text.length}`);
            if (text.length > 100000) {
                text = text.slice(0, 100000) + "\n...[PATCH Truncated]...";
                console.log("ALERT: +100,000 characters in PATCH file. File was truncated.");
            }
            const instructPath = path.join(__dirname, 'INSTRUCTIONS.md');
            let instructions = fs.readFileSync(instructPath, 'utf-8');
            const patch = text;
            // Replace the content inside the ```diff code block
            instructions = instructions.replace(/(```diff\n)[\s\S]*?(```)/, `$1${patch}\n$2`);
            // Write the updated content back to INSTRUCTIONS.md
            fs.writeFileSync(instructPath, instructions, 'utf-8');
            const comments = yield fetchComments(owner, repo, pullNumber);
            const commentsXML = `<comments>\n` +
                comments.map(com => `<comment username=${com.username} date=${com.date}>${com.body}</comment>`).join('\n') +
                `\n</comments>`;
            instructions = instructions.replace(/(```XML\n)[\s\S]*?(```)/, `$1${commentsXML}\n$2`);
            fs.writeFileSync(instructPath, instructions, 'utf-8');
            const userPrompt = patch + "\n\n" + commentsXML;
            const gemini = yield openai.chat.completions.create({
                model: 'gemini-2.0-flash-exp:free',
                messages: [{ role: 'system', content: instructions },
                    { role: 'user', content: userPrompt }]
            });
            const message = (_c = (_b = (_a = gemini.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content;
            if (message) {
                console.log('Gemini says: ' + message);
            }
            else {
                console.error('No valid response from Gemini.');
            }
        }
        catch (err) {
            console.log("AN ERROR OCCURRED: \n" + err);
        }
    });
}
//# sourceMappingURL=pr-explain.js.map