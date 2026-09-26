This is a hackathon that we're using for Polaris School of Technology. What we're going to be doing is creating a video agent that helps us make educational videos. I'm there, and I speak. It can create educational material by using a virtual computer, by using a computer, or by using any such other thing, such that it can create an educative app or an educative video. That's the primary purpose. It's for the hackathon of TrueForge.

To build this project, I'm thinking of first having a local system up and running and functioning, which is demoable today itself. Post which, we will then go and build something where we can do a lot more, like something where we can deploy. For now, we'll keep it on localhost, at least for phase 1 of the hackathon, at least until 3 pm.

Now we need to finish this hackathon by around 4:00 or 4 pm. We have basically 5 hours or so. It's now 11:30, 11 or something. As much as possible, we need to take a lot of videos while we are doing it. That's the primary objective of the hackathon.

They require a public GitHub repository, an MIT license, an example.env file, and a repository that starts from scratch today itself.

My primary objectives are to use:
- remotion, which is a library for special effects
- hyperframes, which is another thing (it's called hyper space frames)
- a bunch of other tools that Opus and ChatGPT have access to, like HTML, CSS, and JavaScript Basically, use that and put different videos and edit them together. Our agent should be able to edit all of it together to create an educative yap / video.

A long-term objective with this is also to add:
- subtitles
- effects
- volume
- background music Tell the agent to decide everything and then do it from scratch so that it's able to do some really good work of it, and perhaps even settle the pacing of the story and so on and so forth. Basically, it needs to be a really intelligent video editor. Think of those educational videos that are made by creators like Vox, or from someone like Cleo Abrams from Vox again, or any of these explainer videos: very educative, with a lot of visuals, different styles of visuals that could be made with HTML, CSS, and JavaScript. They could be made with hyperframes or Remotion, or could also be made with Manim, which is another language developed by 3Blue1Brown.

The idea is to use as many servers and agentic tool calls, as many skills, MCPs, and whatnot, to orchestrate and build out the whole application ASAP. The goal is to create educative apps that range from 20 seconds to 1 minute. It could be any time underneath, but a maximum of around 1 minute, with a small amount of maybe 30 seconds. To build out something like that, the input will be me and my current app about a certain topic, and maybe me giving a bunch of assets and resources to the AI agent in a chat interface or maybe in a different type of interface. The output would be a fully fledged video that is present and has different BGMs, maybe different background music and different styles, and different ways and different visuals, so that I can then post it on Instagram directly. That's the idea.

I'm guessing a good starting point would be something like a nice, simple frontend, a very, very, very basic, bare-bones frontend, with a backend which is probably in Python 3.12 or whichever Python you use to install the Python libraries. My other thought is to build out a pipeline using Truforge, so we have to use Truforge.

https://github.com/truefoundry/trueforge
Basically, for the hackathon, it's compulsory to use this.

npx @truefoundry/trueforge@latest

This is basically what people have told me: you can very quickly start with an NPX. It's got a server which has GPT API, an agent included, and SQLite, and which is supposed to hack over it. I don't know what the advantages of using this are or what the non-advantages of using it are. If we choose, we can even choose to fork this whole thing and reuse it, so that could also be the case. Now the question is: what do we do?

What should our tech stack even be? Should we just use TrueForge? What should we do? This is mostly to do with harness engineering, so it seems to be a pretty good thing. I'm still not sure what we should do to make it work very smoothly. I'm still thinking.