import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { extractCaptions } from "./caption-extractor.tsx";

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-7494be05/health", (c) => {
  return c.json({ status: "ok" });
});

// Test caption extraction endpoint
app.post("/make-server-7494be05/test-captions", async (c) => {
  try {
    const { videoUrl } = await c.req.json();
    
    if (!videoUrl) {
      return c.json({ error: "Video URL is required" }, 400);
    }
    
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      return c.json({ error: "Invalid YouTube URL" }, 400);
    }
    
    console.log(`\n🧪 TESTING CAPTION EXTRACTION FOR: ${videoId}`);
    
    const apiKey = Deno.env.get("YOUTUBE_API_KEY");
    console.log(`   API Key available: ${apiKey ? `YES (${apiKey.substring(0, 10)}...)` : 'NO'}`);
    
    const result = await extractCaptions(videoId, apiKey);
    
    if (!result) {
      return c.json({ 
        success: false,
        message: "No captions found for this video. The video may not have captions/subtitles available.",
        videoId,
        apiKeyConfigured: !!apiKey
      });
    }
    
    return c.json({
      success: true,
      videoId,
      method: result.method,
      language: result.language,
      source: result.source,
      transcriptLength: result.transcript.length,
      preview: result.transcript.substring(0, 300) + "...",
      fullTranscript: result.transcript,
      apiKeyUsed: !!apiKey
    });
    
  } catch (error) {
    console.error("Test endpoint error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Extract video ID from YouTube URL
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}



// Get YouTube video transcript
app.post("/make-server-7494be05/get-transcript", async (c) => {
  try {
    const { videoUrl } = await c.req.json();
    
    if (!videoUrl) {
      return c.json({ error: "Video URL is required" }, 400);
    }

    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      return c.json({ error: "Invalid YouTube URL. Please enter a valid YouTube video URL." }, 400);
    }

    const apiKey = Deno.env.get("YOUTUBE_API_KEY");
    if (!apiKey) {
      return c.json({ error: "YouTube API key not configured" }, 500);
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📹 Processing video ID: ${videoId}`);
    console.log('='.repeat(80));

    // Get video details
    const videoDetailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${apiKey}`;
    const videoResponse = await fetch(videoDetailsUrl);
    
    if (!videoResponse.ok) {
      console.log(`❌ YouTube API error: ${videoResponse.status}`);
      const errorData = await videoResponse.json();
      console.log(`Error details:`, errorData);
      return c.json({ 
        error: "Failed to fetch video details from YouTube API. Please check the video URL." 
      }, 500);
    }
    
    const videoData = await videoResponse.json();

    if (!videoData.items || videoData.items.length === 0) {
      console.log(`❌ Video not found: ${videoId}`);
      return c.json({ 
        error: "Video not found. It may be private, deleted, or the URL is incorrect." 
      }, 404);
    }

    const item = videoData.items[0];
    const videoInfo = {
      title: item.snippet.title,
      description: item.snippet.description || '',
      thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
      channelTitle: item.snippet.channelTitle,
      duration: item.contentDetails?.duration || 'Unknown',
      viewCount: item.statistics?.viewCount || '0',
    };

    console.log(`📺 Video: "${videoInfo.title}"`);
    console.log(`👤 Channel: ${videoInfo.channelTitle}`);
    console.log(`👁️  Views: ${videoInfo.viewCount}`);
    console.log(`📝 Description length: ${videoInfo.description.length} chars`);

    // Try to get captions using YouTube Data API
    let hasCaptions = false;
    try {
      console.log(`\n[Captions] Checking caption availability via API...`);
      const captionsListUrl = `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${apiKey}`;
      const captionsResponse = await fetch(captionsListUrl);
      
      if (captionsResponse.ok) {
        const captionsData = await captionsResponse.json();
        hasCaptions = captionsData.items && captionsData.items.length > 0;
        if (hasCaptions) {
          console.log(`[Captions] ✅ Video has ${captionsData.items.length} caption track(s)`);
        } else {
          console.log(`[Captions] ⚠️  No captions available`);
        }
      } else {
        console.log(`[Captions] API check returned ${captionsResponse.status}`);
      }
    } catch (error) {
      console.log(`[Captions] API check failed: ${error.message}`);
    }

    // Try to extract captions using the dedicated caption extractor
    let transcript = '';
    let captionsAvailable = false;
    let usedDescription = false;
    let source = '';
    
    // Pass the API key to the caption extractor
    const captionResult = await extractCaptions(videoId, apiKey);
    
    if (captionResult && captionResult.transcript.length > 100) {
      transcript = captionResult.transcript;
      captionsAvailable = true;
      source = captionResult.source;
      console.log(`\n🎉 CAPTION EXTRACTION SUCCESSFUL!`);
      console.log(`   Method: ${captionResult.method}`);
      console.log(`   Language: ${captionResult.language}`);
      console.log(`   Length: ${transcript.length} chars`);
    }

    // Fallback: Use video description if captions not accessible
    if (!transcript || transcript.length < 100) {
      console.log(`\n⚠️  ALL CAPTION METHODS FAILED`);
      console.log(`[Fallback] Captions not accessible, checking description...`);
      
      if (videoInfo.description && videoInfo.description.length > 200) {
        transcript = videoInfo.description;
        usedDescription = true;
        captionsAvailable = false;
        source = 'description';
        console.log(`⚠️  FALLBACK: Using video description instead of captions (${transcript.length} chars)`);
        console.log(`⚠️  NOTE: This is the description text, NOT the spoken transcript!`);
      } else {
        // Last resort: create a basic summary from video metadata
        console.log(`⚠️  Description too short, using video metadata`);
        
        transcript = `Title: ${videoInfo.title}\n\nChannel: ${videoInfo.channelTitle}\n\nDescription: ${videoInfo.description || 'No description available.'}\n\nThis video has been viewed ${parseInt(videoInfo.viewCount).toLocaleString()} times.`;
        
        usedDescription = true;
        captionsAvailable = false;
        source = 'metadata';
        
        if (transcript.length < 100) {
          return c.json({ 
            error: "❌ This video does NOT have captions/subtitles available. Cannot extract spoken transcript.",
            suggestion: "Please try a video that has the CC (closed captions) button enabled when you watch it on YouTube.",
            videoInfo,
            hasCaptions
          }, 404);
        }
      }
    }

    // Calculate statistics
    const wordCount = transcript.split(/\s+/).filter(w => w.length > 0).length;
    const estimatedReadingTime = Math.ceil(wordCount / 200);

    console.log(`\n✅ Content ready:`);
    console.log(`   Source: ${source}`);
    console.log(`   Preview: "${transcript.substring(0, 200)}..."`);
    console.log(`   Length: ${transcript.length} chars`);
    console.log(`   Words: ${wordCount}`);
    console.log(`   Reading time: ~${estimatedReadingTime} min`);
    console.log('='.repeat(80));

    return c.json({
      videoId,
      videoInfo,
      transcript,
      captionsAvailable,
      transcriptLength: transcript.length,
      wordCount,
      estimatedReadingTime,
      usedDescription,
      source,
      hasCaptions
    });

  } catch (error) {
    console.error("\n❌ Error in get-transcript endpoint:", error);
    console.error("Stack:", error.stack);
    return c.json({ 
      error: `Server error: ${error.message}` 
    }, 500);
  }
});

// Summarize transcript using AI
app.post("/make-server-7494be05/summarize", async (c) => {
  try {
    const { transcript, videoTitle, source } = await c.req.json();
    
    if (!transcript) {
      return c.json({ error: "Transcript is required" }, 400);
    }

    console.log(`\n📝 Generating summary for: "${videoTitle}"`);
    console.log(`   Source: ${source || 'unknown'}`);
    console.log(`   Content length: ${transcript.length} chars`);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    
    // If no OpenAI key, create a simple extractive summary
    if (!openaiKey) {
      console.log('⚠️  No OpenAI key - creating extractive summary');
      
      const sentences = transcript
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 20);
      
      const summary = sentences.slice(0, Math.min(5, sentences.length)).join('. ') + '.';
      const keyPoints = sentences
        .slice(0, Math.min(6, sentences.length))
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      return c.json({
        summary: summary || transcript.substring(0, 300) + '...',
        keyPoints: keyPoints.length > 0 ? keyPoints : ['Summary not available'],
        isAiGenerated: false
      });
    }

    // Use OpenAI for better summarization
    const words = transcript.split(/\s+/);
    const truncatedTranscript = words.length > 4000 
      ? words.slice(0, 4000).join(' ') + '...'
      : transcript;

    const systemPrompt = source === 'description' 
      ? "You are a helpful assistant that creates summaries from video descriptions. Extract the main points about what the video is about."
      : "You are a helpful assistant that creates concise and informative summaries of video content. Extract the main points and key takeaways.";

    console.log(`🤖 Calling OpenAI API...`);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `Please summarize this video ${source === 'description' ? 'description' : 'content'} from "${videoTitle}":\n\n${truncatedTranscript}\n\nProvide:\n1. A brief summary (2-3 sentences)\n2. 3-5 key points as a numbered list`
          }
        ],
        temperature: 0.7,
        max_tokens: 600
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ OpenAI API error:', errorData);
      
      // Fallback to extractive summary
      const sentences = transcript.split(/[.!?]+/).filter((s: string) => s.trim().length > 20);
      const summary = sentences.slice(0, 5).join('. ') + '.';
      const keyPoints = sentences.slice(0, 5).map((s: string) => s.trim());
      
      return c.json({
        summary,
        keyPoints,
        isAiGenerated: false,
        error: 'AI generation failed, showing extractive summary'
      });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    console.log(`✅ AI summary generated`);
    
    // Parse the response to extract summary and key points
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let summary = '';
    const keyPoints: string[] = [];
    let foundKeyPointsSection = false;
    
    for (const line of lines) {
      // Check if this line starts a key points section
      if (line.match(/^(key points?|main points?|takeaways?):/i) || 
          line.match(/^\d+\./)) {
        foundKeyPointsSection = true;
      }
      
      // If we found a numbered point, add it
      if (foundKeyPointsSection && line.match(/^\d+\./)) {
        const point = line.replace(/^\d+\.\s*/, '').trim();
        if (point.length > 10) {
          keyPoints.push(point);
        }
      } else if (foundKeyPointsSection && (line.startsWith('-') || line.startsWith('•'))) {
        const point = line.replace(/^[-•]\s*/, '').trim();
        if (point.length > 10) {
          keyPoints.push(point);
        }
      } else if (!foundKeyPointsSection && line.length > 20) {
        // Build summary from lines before key points section
        summary += line + ' ';
      }
    }

    // If parsing failed, use the whole content as summary
    if (keyPoints.length === 0) {
      summary = content.substring(0, 500);
      const sentences = content.split(/[.!?]+/).filter((s: string) => s.trim().length > 20);
      keyPoints.push(...sentences.slice(0, 5).map((s: string) => s.trim()));
    }

    if (!summary || summary.length < 20) {
      summary = content.substring(0, 300);
    }

    console.log(`   Summary: ${summary.length} chars`);
    console.log(`   Key points: ${keyPoints.length}`);

    return c.json({
      summary: summary.trim(),
      keyPoints: keyPoints.filter(p => p.length > 0),
      isAiGenerated: true
    });

  } catch (error) {
    console.error("❌ Error generating summary:", error);
    
    // Return a basic extractive summary as fallback
    const sentences = transcript.split(/[.!?]+/).filter((s: string) => s.trim().length > 20);
    return c.json({
      summary: sentences.slice(0, 3).join('. ') + '.',
      keyPoints: sentences.slice(0, 5).map((s: string) => s.trim()).filter((s: string) => s.length > 0),
      isAiGenerated: false,
      error: `Summary generation failed: ${error.message}`
    });
  }
});

Deno.serve(app.fetch);
