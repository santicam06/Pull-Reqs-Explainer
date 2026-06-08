import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

for (let d = __dirname; d !== path.dirname(d); d = path.dirname(d)) {
  if (fs.existsSync(path.join(d, '.env'))) { 
    dotenv.config({ path: path.join(d, '.env') }); 
    break; 
  }
}
if (!process.env.OPENROUTER_API_KEY) dotenv.config();

const openai = new OpenAI({
  // Override the baseURL so that we use OpenRouter's API vs. OpenAI
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

import { spawn } from 'child_process';

// Python tool's script to be run from Node.js as a child_process
function getGithubFilePy(
  owner: string,
  repo: string,
  filepath: string,
  ref = "main",
  maxLines = 500
): Promise<string> {
  return new Promise((resolve, reject) => {
    
    // Spawn a new process with the calling command for the tool
    const py = spawn('python', [
      path.join(__dirname, 'tools.py'),
      '--owner', owner,
      '--repo', repo,
      '--filepath', filepath,
      '--ref', ref,
      '--maxLines', maxLines.toString()
    ]);

    let data = '';
    let err = '';

    // Collect data and/or errors from the stream of Node.js -> Event listeners
    py.stdout.on('data', chunk => data += chunk);
    py.stderr.on('data', chunk => err += chunk);

    // Manage status code of the execution process
    py.on('close', code => {
      if (code === 0) {
        resolve(data);
      } else {
        reject(err || `Python process exited with code ${code}`);
      }
    });
  });
}

function confirmURL(url: string): { owner: string, repo: string, pullNumber: number } {
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

interface Comment {
  username: string;
  body: string;
  date: string;
}

/* In the GitHub API, Pull Requests are technically called "Issues." 
  To get the comments for a PR, you query the issues comments endpoint. */
async function fetchComments(owner: string, repo: string, issueNum: number): Promise<Comment[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNum}/comments`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'AIP444-Lab-03',                //  GitHub requires app identity
      Accept: 'application/vnd.github+json',        //  Ensures GitHub's JSON format
      'X-GitHub-Api-Version': '2022-11-28',         //  Ensures API stability
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API Error: ${response.statusText}`);
  }

  const data = await response.json();

  // Extract only the fields we need
  return data.map((item: any) => ({
    username: item.user.login,
    body: item.body,
    date: item.updated_at,
  }));
}

const url = process.argv[2];


const GitHubTool = 
  {
    type: 'function' as const,
    function: {
      name: 'get_github_file',
      description: 'Reads a raw format file retrieved from GitHub and only up to the number of lines specified in the parameter. Use this tool function only if when analyzing the diff and comments there is not enough information to explain (e.g. lack of context to be coherent when explaining)', 

      parameters: {
        type: 'object',
        properties: {
          owner: {
            type: 'string',
            description: 'The owner of the repository where the file is located',
          },
          repo: {
            type: 'string',
            description: 'The name of the GitHub repository',
          },
          filepath: {
            type: 'string',
            description: 'The absolute path conducting to the file in the repository',
          },
          ref: {
            type: 'string',
            description: 'The name/path of the branch where the file is located',
            default: 'main'
          },
          maxLines: {
            type: 'number',
            description: 'The maximum number of lines allowed to read from the file; this is to handle very long files',
            default: 500
          },
        },
        required: ['owner', 'repo', 'filepath'],
        additionalProperties: false,
      },
      strict: true,
    },
  };


async function main() {
  
  const args = process.argv.slice(2);
  const isVerbose = args.includes('--verbose');

  const validFlags = ['--verbose'];
  const invalidFlags = args.filter(arg => arg.startsWith('--') && !validFlags.includes(arg));
  if (invalidFlags.length > 0) {
    console.error(`An invalid flag was entered. Correct use: npx tsx src/pr-explain.ts "<GitHub PR URL>" [--verbose]`);
    process.exit(1);
  }

  // Redirect stderr to debug.txt when verbose mode is enabled (suppress terminal output)
    let debugStream: fs.WriteStream | null = null;
    if (isVerbose) {
        const debugPath = path.resolve(process.cwd(), 'src/debug.txt');
        debugStream = fs.createWriteStream(debugPath, { flags: 'w' });
        process.stderr.write = (chunk: any, encoding?: any, callback?: any) => {
            debugStream?.write(chunk, encoding);
            if (callback) callback();
            return true;
        };
    }
  
  try {

        if (!url) {
           console.error("No URL provided. try: node pr-explain.js <GitHub PR URL>");
           process.exit(1);
        }
        
        const { owner, repo, pullNumber } = confirmURL(url);
        console.error(`Owner: ${owner}`);
        console.error(`Repo: ${repo}`);
        console.error(`Pull Req. Number: ${pullNumber}`);

        console.log("\n👓🗃️ Analyzing your Pull Request...")

        const patchUrl = url + ".patch";
        const response = await fetch(patchUrl);

        if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
        let text = await response.text();

        console.error(`TOTAL CHARACTERS IN PATCH: ${text.length}`);

        if (text.length > 100000) {
            text = text.slice(0, 100000) + "\n...[PATCH Truncated]...";
            console.error("ALERT: +100,000 characters in PATCH file. File was truncated.");
        }

        const MODEL_FLASH = 'google/gemini-2.5-flash';
        const MODEL_PRO = 'google/gemini-2.5-pro';
        const PATCH_SIZE_THRESHOLD = 50000;

        const selectedModel = text.length > PATCH_SIZE_THRESHOLD ? MODEL_PRO : MODEL_FLASH;
        console.error(`USING MODEL: ${selectedModel} (patch size: ${text.length} chars, threshold: ${PATCH_SIZE_THRESHOLD})`);

        let __dirname = path.dirname(new URL(import.meta.url).pathname);
        if (process.platform === "win32" && __dirname.startsWith("/")) {
          __dirname = __dirname.slice(1);
        }
        const instructPath = path.join(__dirname, 'INSTRUCTIONS.md');
        let instructions = fs.readFileSync(instructPath, 'utf-8');
    
        const patch = text;

        // Replace the content inside the ```diff code block
        instructions = instructions.replace(
        /(```diff\n)[\s\S]*?(```)/,`$1${patch}\n$2`
        );

        // Write the updated content back to INSTRUCTIONS.md
        fs.writeFileSync(instructPath, instructions, 'utf-8');

        const comments = await fetchComments(owner, repo, pullNumber);

        const commentsXML =
            `<comments>\n` +
            comments.map(com =>
                `<comment username=${com.username} date=${com.date}>${com.body}</comment>`
            ).join('\n') +
            `\n</comments>`;

        instructions = instructions.replace(
        /(```XML\n)[\s\S]*?(```)/,`$1${commentsXML}\n$2`
        );

        fs.writeFileSync(instructPath, instructions, 'utf-8');

        const userPrompt = patch + "\n\n" + commentsXML;
        
        // any allows having an array with each object having different size of properties
        let messagesPack: any = [
                        { role: 'system', content: instructions },
                        { role: 'user', content: userPrompt },
                    ];

        const gemini = await openai.chat.completions.create({
            model: selectedModel,
            messages: messagesPack,
            tools: [GitHubTool],
            tool_choice: "auto",
        });

        const message = gemini?.choices[0]?.message;
        let i = 0;
        
        while (i < 5) {
            ++i;
            console.error('ITERATION #' + i + '\n');
            if (message && message.tool_calls) {
                for (const toolCall of message.tool_calls) {
                    if (toolCall && toolCall.type === 'function') {
                        const functionName = toolCall.function.name;
                        const args = JSON.parse(toolCall.function.arguments);

                        console.error('TOOLCALL ID: ' + toolCall.id);
                        console.error('   FUNCTION CALLED: ' + JSON.stringify(toolCall.function) + '\n');

                        if (functionName == 'get_github_file') {
                            const content = await getGithubFilePy(
                                args.owner,
                                args.repo,
                                args.filepath,
                                args.ref,
                                args.maxLines
                            );

                            const GHFileContent = JSON.stringify(content);

                            messagesPack.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                content: GHFileContent,
                            }); 
                        }
                    } 
                }
                continue;
            } 
            else if (message) {
                break;
            }
        }

        const finalResponse = await openai.chat.completions.create({
                            model: selectedModel,
                            messages: messagesPack,
        });

        const finalMessage = finalResponse.choices[0]?.message.content;

        if (finalMessage) {
        console.log('\nThe PR explainer says: \n\n' + finalResponse.choices[0]?.message.content);
        }
        else {
            console.error('😕 No valid response from the explainer.')
        }
        
            
    } 
    catch (error: any) {

        console.error(`⚠️  AN ERROR OCCURRED: ${error}`);
        if (isVerbose && debugStream) {
            debugStream.end();
        }
        process.exit(1);
    }
    finally {
        if (isVerbose && debugStream) {
            debugStream.end();
        }
    }

}

main();