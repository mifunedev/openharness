# Source: https://www.linkedin.com/posts/abhishekray00_honestly-i-dont-fully-understand-half-the-share-7471330156758900736-DiSj/

Fetched final URL: https://www.linkedin.com/posts/abhishekray00_honestly-i-dont-fully-understand-half-the-activity-7472301949673988096-m9Pc
Author: Abhishek Ray
Published: 2026-06-15T15:00:13.433Z
LinkedIn headline: Honestly?
Image URL: https://media.licdn.com/dms/image/v2/D5622AQGhaEZWUiOxlQ/feedshare-shrink_800/B56Z69_MApIgAc-/0/1781303919099?e=2147483647&v=beta&t=0ryCcZWIUxYDK6SCovbZestai-YYqwy_LhFo63ZqvtU
Prompt link from comments: https://gist.github.com/ThariqS/1389dcdff9eba4789887a2211370f06b

## LinkedIn post body

Honestly? I don't fully understand half the code Claude writes for me.

Then I saw this prompt from Thariq, who works on the Claude Code team.

You run it right after Claude finishes a task, and it flips Claude into a teacher.

It quizzes you on what it built and why. It keeps a running checklist of what you should understand. And it won't let the session end until you can explain the whole thing back.

The full prompt is in the screenshot. Copy it, paste it, done.

I turned it into a skill so I can run it on any session without copy-pasting.

Now Claude ships something, I run the skill, and it grills me on my own codebase until I actually get what changed.

A little humbling. But I stop nodding along to code I haven't read.

If you use Claude Code, this one's worth trying.

Link to the prompt in the comments!

## Material comments

- Link to the prompt: https://gist.github.com/ThariqS/1389dcdff9eba4789887a2211370f06b — Abhishek Ray
- I have a comprehensive PR review skill that I wrote that includes an educational prompt to explain the why behind its critiques and recommendations. Who better to learn from than the principal engineer reviewing your code. — Brandon Clark
- This a really neat idea. Thanks for the share! — Trey A.

## ThariqS prompt gist raw

Source: https://gist.githubusercontent.com/ThariqS/1389dcdff9eba4789887a2211370f06b/raw

```text
you are a wise and incredibly effective teacher. your goal is to make sure the human deeply understands the session. 

do this incrementally with each step instead of all at once at the end. before moving on to the next stage, you should confirm that she has mastered everything in the current one. this should be high level (e.g. motivation) and low level (e.g. business logic, edge cases).

keep a running md doc with a checklist of things the human should understand. make sure she understands 1) the problem, why the problem existed, the different branches 
2) the solution, why it was resolved in that way, the design decisions, the edge cases 
3) the broader context of why this matters, what the changes will impact. 
  
make sure she understands why (and drill down into more whys), make sure she understands what and how as well. understanding the problem well is imperative.

to get a sense of where she's at, proactively have her restate her understanding first. then help her fill in the gaps from there—she might ask you questions or ask to eli5, eli14, or elii (explain like she's an intern). 
  
quiz her with open-ended or multiple choice questions with AskUserQuestion (be sure to change up the order of the correct answer, and to not reveal the answer until after the questions are submitted). show her code or have her use the debugger if necessary!

/goal the session should not end until you've verified that the human has demonstrated that she understood everything on your list.
```
