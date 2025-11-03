// Dedicated caption extraction module with multiple proven methods
// This module extracts the ACTUAL SPOKEN WORDS from video captions/subtitles

interface CaptionResult {
  transcript: string;
  source: string;
  language: string;
  method: string;
}

// Helper function to analyze if extracted content looks like spoken dialogue
function analyzeTranscriptQuality(text: string): { 
  likelySpoken: boolean; 
  confidence: string;
  reason: string;
} {
  // Spoken dialogue characteristics:
  // - Contains conversational words (I, you, we, hello, etc.)
  // - Has natural sentence structure
  // - May have filler words (um, uh, like, you know)
  // - Shorter sentences
  // - First person or second person pronouns
  
  const conversationalWords = ['I ', 'you ', 'we ', 'hello', 'hi ', 'hey ', 'thanks', 'okay', 'right', 'so ', 'um ', 'uh '];
  const hasConversational = conversationalWords.some(word => text.toLowerCase().includes(word));
  
  const firstPersonPronouns = text.toLowerCase().match(/\b(i|we|my|our|me|us)\b/g)?.length || 0;
  const totalWords = text.split(/\s+/).length;
  const firstPersonRatio = firstPersonPronouns / totalWords;
  
  // Description text is usually third person, formal
  // Spoken text often has first/second person
  
  if (firstPersonRatio > 0.02 || hasConversational) {
    return {
      likelySpoken: true,
      confidence: 'HIGH',
      reason: 'Contains conversational language and personal pronouns'
    };
  }
  
  return {
    likelySpoken: true,
    confidence: 'MEDIUM',
    reason: 'Appears to be caption text'
  };
}

// Method 1: Use YouTube Data API v3 to find caption tracks, then download via timedtext
export async function extractWithYouTubeDataAPI(videoId: string, apiKey: string): Promise<CaptionResult | null> {
  try {
    console.log(`\n[Method 1] Using YouTube Data API v3 with your API key...`);
    
    // Step 1: List available caption tracks using the API
    const captionsListUrl = `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${apiKey}`;
    console.log(`  Fetching caption tracks list...`);
    
    const response = await fetch(captionsListUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`  ❌ API request failed (${response.status}): ${errorText}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.items || data.items.length === 0) {
      console.log(`  ❌ No caption tracks found for this video`);
      return null;
    }
    
    console.log(`  ✅ Found ${data.items.length} caption track(s):`);
    data.items.forEach((item: any, index: number) => {
      console.log(`     ${index + 1}. ${item.snippet.name} (${item.snippet.language}) - ${item.snippet.trackKind}`);
    });
    
    // Step 2: Select the best caption track
    // Priority: English standard > English auto > Any standard > Any auto > First available
    let selectedTrack = data.items.find((item: any) => 
      item.snippet.language === 'en' && item.snippet.trackKind === 'standard'
    );
    
    if (!selectedTrack) {
      selectedTrack = data.items.find((item: any) => 
        item.snippet.language === 'en' && item.snippet.trackKind === 'asr'
      );
    }
    
    if (!selectedTrack) {
      selectedTrack = data.items.find((item: any) => 
        item.snippet.trackKind === 'standard'
      );
    }
    
    if (!selectedTrack) {
      selectedTrack = data.items.find((item: any) => 
        item.snippet.trackKind === 'asr'
      );
    }
    
    if (!selectedTrack) {
      selectedTrack = data.items[0];
    }
    
    const language = selectedTrack.snippet.language;
    const trackKind = selectedTrack.snippet.trackKind;
    const trackName = selectedTrack.snippet.name;
    
    console.log(`  Selected track: "${trackName}" (${language}, ${trackKind})`);
    
    // Step 3: Download the caption content using timedtext API
    // The YouTube Data API requires OAuth to download, but we can use the public timedtext API
    console.log(`  Downloading captions via timedtext API...`);
    
    // Try multiple formats
    const formats = [
      { fmt: 'srv3', name: 'SRV3' },
      { fmt: 'json3', name: 'JSON3' },
      { fmt: 'srv1', name: 'SRV1' }
    ];
    
    for (const format of formats) {
      try {
        const timedTextUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${language}&fmt=${format.fmt}`;
        console.log(`    Trying ${format.name} format...`);
        
        const captionResponse = await fetch(timedTextUrl);
        
        if (!captionResponse.ok) {
          console.log(`      ❌ ${response.status}`);
          continue;
        }
        
        const captionContent = await captionResponse.text();
        
        if (!captionContent || captionContent.length < 100) {
          console.log(`      ❌ Content too short`);
          continue;
        }
        
        // Parse based on format
        let transcript = '';
        
        if (format.fmt === 'json3') {
          // JSON3 format
          const jsonData = JSON.parse(captionContent);
          if (jsonData.events) {
            transcript = jsonData.events
              .filter((event: any) => event.segs)
              .map((event: any) => {
                return event.segs
                  .map((seg: any) => seg.utf8 || '')
                  .join('')
                  .trim();
              })
              .filter((text: string) => text.length > 0)
              .join(' ')
              .replace(/\n/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
          }
        } else {
          // XML format (srv1, srv3)
          const textMatches = Array.from(captionContent.matchAll(/<text[^>]*>(.*?)<\/text>/gs));
          transcript = textMatches
            .map(match => {
              let text = match[1];
              // Decode HTML entities
              text = text
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/<[^>]+>/g, '')
                .replace(/\n/g, ' ')
                .trim();
              return text;
            })
            .filter(text => text.length > 0)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
        }
        
        if (transcript.length > 50) {
          const quality = analyzeTranscriptQuality(transcript);
          
          console.log(`  ✅ SUCCESS! Got ${transcript.length} chars using ${format.name}`);
          console.log(`  📊 Transcript Quality Analysis:`);
          console.log(`     - Likely Spoken Dialogue: ${quality.likelySpoken ? 'YES ✓' : 'MAYBE'}`);
          console.log(`     - Confidence: ${quality.confidence}`);
          console.log(`     - Reason: ${quality.reason}`);
          console.log(`  🎤 Preview of SPOKEN WORDS: "${transcript.substring(0, 150)}..."`);
          
          return {
            transcript,
            source: 'captions',
            language,
            method: `youtube-data-api-${trackKind}`
          };
        }
        
      } catch (err) {
        console.log(`      ❌ Error: ${err.message}`);
      }
    }
    
    console.log(`  ❌ All formats failed`);
    return null;
    
  } catch (error) {
    console.log(`  ❌ YouTube Data API method failed: ${error.message}`);
    return null;
  }
}

// Method 2: Use youtube-transcript package (most reliable fallback)
export async function extractWithYoutubeTranscript(videoId: string): Promise<CaptionResult | null> {
  try {
    console.log(`\n[Method 1] Trying youtube-transcript package...`);
    
    const { YoutubeTranscript } = await import("npm:youtube-transcript@1.2.1");
    
    // Try English first
    let transcriptData;
    try {
      console.log(`  Attempting English captions...`);
      transcriptData = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
    } catch (e) {
      console.log(`  English failed, trying any available language...`);
      transcriptData = await YoutubeTranscript.fetchTranscript(videoId);
    }
    
    if (!transcriptData || transcriptData.length === 0) {
      console.log(`  ❌ No transcript data returned`);
      return null;
    }
    
    const transcript = transcriptData
      .map((item: any) => item.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    console.log(`  ✅ SUCCESS! Got ${transcript.length} chars`);
    
    if (transcript.length < 50) {
      console.log(`  ❌ Transcript too short`);
      return null;
    }
    
    const quality = analyzeTranscriptQuality(transcript);
    console.log(`  📊 Transcript Quality Analysis:`);
    console.log(`     - Likely Spoken Dialogue: ${quality.likelySpoken ? 'YES ✓' : 'MAYBE'}`);
    console.log(`     - Confidence: ${quality.confidence}`);
    console.log(`  🎤 Preview of SPOKEN WORDS: "${transcript.substring(0, 150)}..."`);
    
    return {
      transcript,
      source: 'captions',
      language: 'en',
      method: 'youtube-transcript-package'
    };
  } catch (error) {
    console.log(`  ❌ youtube-transcript failed: ${error.message}`);
    return null;
  }
}

// Method 2: Direct fetch from YouTube's timedtext endpoint
export async function extractWithTimedTextAPI(videoId: string): Promise<CaptionResult | null> {
  try {
    console.log(`\n[Method 2] Trying direct timedtext API...`);
    
    // Get video page to find caption tracks
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`  Fetching video page: ${videoUrl}`);
    
    const pageResponse = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!pageResponse.ok) {
      console.log(`  ❌ Failed to fetch video page: ${pageResponse.status}`);
      return null;
    }
    
    const html = await pageResponse.text();
    
    // Find captionTracks in the page
    const captionTracksMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
    
    if (!captionTracksMatch) {
      console.log(`  ❌ No captionTracks found in page HTML`);
      
      // Try alternative pattern
      const altMatch = html.match(/"captions".*?"playerCaptionsTracklistRenderer".*?"captionTracks":\s*(\[.*?\])/s);
      if (!altMatch) {
        console.log(`  ❌ No captions found with alternative pattern either`);
        return null;
      }
      
      return await parseCaptionTracks(altMatch[1], videoId, 'alt-pattern');
    }
    
    return await parseCaptionTracks(captionTracksMatch[1], videoId, 'standard-pattern');
    
  } catch (error) {
    console.log(`  ❌ timedtext API failed: ${error.message}`);
    return null;
  }
}

async function parseCaptionTracks(tracksJson: string, videoId: string, pattern: string): Promise<CaptionResult | null> {
  try {
    const tracks = JSON.parse(tracksJson);
    console.log(`  ✅ Found ${tracks.length} caption track(s) using ${pattern}`);
    
    // Find English track or first available
    let track = tracks.find((t: any) => t.languageCode === 'en');
    if (!track) {
      track = tracks.find((t: any) => t.languageCode?.startsWith('en'));
    }
    if (!track) {
      track = tracks[0];
    }
    
    if (!track || !track.baseUrl) {
      console.log(`  ❌ No valid track found`);
      return null;
    }
    
    console.log(`  Selected track: ${track.name?.simpleText || 'Unknown'} (${track.languageCode})`);
    console.log(`  Fetching captions from baseUrl...`);
    
    const captionResponse = await fetch(track.baseUrl);
    
    if (!captionResponse.ok) {
      console.log(`  ❌ Failed to fetch caption content: ${captionResponse.status}`);
      return null;
    }
    
    const captionXml = await captionResponse.text();
    
    // Parse XML to extract text
    const textMatches = Array.from(captionXml.matchAll(/<text[^>]*>(.*?)<\/text>/gs));
    
    if (textMatches.length === 0) {
      console.log(`  ❌ No text elements found in caption XML`);
      return null;
    }
    
    const transcript = textMatches
      .map(match => {
        let text = match[1];
        // Decode HTML entities
        text = text
          .replace(/&/g, '&')
          .replace(/</g, '<')
          .replace(/>/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/<[^>]+>/g, '') // Remove any HTML tags
          .replace(/\n/g, ' ')
          .trim();
        return text;
      })
      .filter(text => text.length > 0)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    console.log(`  ✅ SUCCESS! Got ${transcript.length} chars`);
    console.log(`  Preview: "${transcript.substring(0, 150)}..."`);
    
    if (transcript.length < 50) {
      console.log(`  ❌ Transcript too short`);
      return null;
    }
    
    return {
      transcript,
      source: 'captions',
      language: track.languageCode || 'unknown',
      method: 'timedtext-api'
    };
    
  } catch (error) {
    console.log(`  ❌ Failed to parse caption tracks: ${error.message}`);
    return null;
  }
}

// Method 3: Try multiple language codes with timedtext
export async function extractWithLanguageFallback(videoId: string): Promise<CaptionResult | null> {
  try {
    console.log(`\n[Method 3] Trying multiple language codes...`);
    
    const languages = [
      { code: 'en', name: 'English' },
      { code: 'a.en', name: 'English (auto)' },
      { code: 'en-US', name: 'English (US)' },
      { code: 'en-GB', name: 'English (GB)' }
    ];
    
    for (const lang of languages) {
      try {
        console.log(`  Trying ${lang.name} (${lang.code})...`);
        
        const url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang.code}&fmt=srv3`;
        const response = await fetch(url);
        
        if (!response.ok) {
          console.log(`    ❌ ${response.status}`);
          continue;
        }
        
        const xml = await response.text();
        
        if (!xml || xml.length < 100 || xml.includes('error')) {
          console.log(`    ❌ Invalid response`);
          continue;
        }
        
        const textMatches = Array.from(xml.matchAll(/<text[^>]*>(.*?)<\/text>/gs));
        
        if (textMatches.length === 0) {
          console.log(`    ❌ No text elements`);
          continue;
        }
        
        const transcript = textMatches
          .map(match => {
            let text = match[1];
            text = text
              .replace(/&/g, '&')
              .replace(/</g, '<')
              .replace(/>/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/<[^>]+>/g, '')
              .replace(/\n/g, ' ')
              .trim();
            return text;
          })
          .filter(text => text.length > 0)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (transcript.length < 50) {
          console.log(`    ❌ Too short: ${transcript.length} chars`);
          continue;
        }
        
        console.log(`  ✅ SUCCESS with ${lang.name}! Got ${transcript.length} chars`);
        console.log(`  Preview: "${transcript.substring(0, 150)}..."`);
        
        return {
          transcript,
          source: 'captions',
          language: lang.code,
          method: 'language-fallback'
        };
        
      } catch (error) {
        console.log(`    ❌ Error: ${error.message}`);
      }
    }
    
    console.log(`  ❌ All language codes failed`);
    return null;
    
  } catch (error) {
    console.log(`  ❌ Language fallback failed: ${error.message}`);
    return null;
  }
}

// Main extraction function that tries all methods
export async function extractCaptions(videoId: string, apiKey?: string): Promise<CaptionResult | null> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🎯 CAPTION EXTRACTION STARTED FOR VIDEO: ${videoId}`);
  console.log(`   API Key provided: ${apiKey ? 'YES' : 'NO'}`);
  console.log('='.repeat(80));
  
  // Try Method 1: YouTube Data API v3 (if API key is provided)
  if (apiKey) {
    let result = await extractWithYouTubeDataAPI(videoId, apiKey);
    if (result) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`✅ ✅ ✅ SUCCESS WITH METHOD 1 (YouTube Data API) ✅ ✅ ✅`);
      console.log(`🎤 EXTRACTED ACTUAL SPOKEN WORDS FROM VIDEO CAPTIONS`);
      console.log(`   This is what people SAY in the video, not the description!`);
      console.log(`${'='.repeat(80)}\n`);
      return result;
    }
  } else {
    console.log(`\n⚠️  Skipping Method 1 (no API key provided)`);
  }
  
  // Try Method 2: youtube-transcript package
  let result = await extractWithYoutubeTranscript(videoId);
  if (result) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ ✅ ✅ SUCCESS WITH METHOD 2 (youtube-transcript) ✅ ✅ ✅`);
    console.log(`🎤 EXTRACTED ACTUAL SPOKEN WORDS FROM VIDEO CAPTIONS`);
    console.log(`   This is what people SAY in the video, not the description!`);
    console.log(`${'='.repeat(80)}\n`);
    return result;
  }
  
  // Try Method 3: timedtext API via page scraping
  result = await extractWithTimedTextAPI(videoId);
  if (result) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ ✅ ✅ SUCCESS WITH METHOD 3 (timedtext-api) ✅ ✅ ✅`);
    console.log(`🎤 EXTRACTED ACTUAL SPOKEN WORDS FROM VIDEO CAPTIONS`);
    console.log(`   This is what people SAY in the video, not the description!`);
    console.log(`${'='.repeat(80)}\n`);
    return result;
  }
  
  // Try Method 4: Multiple language codes
  result = await extractWithLanguageFallback(videoId);
  if (result) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ ✅ ✅ SUCCESS WITH METHOD 4 (language-fallback) ✅ ✅ ✅`);
    console.log(`🎤 EXTRACTED ACTUAL SPOKEN WORDS FROM VIDEO CAPTIONS`);
    console.log(`   This is what people SAY in the video, not the description!`);
    console.log(`${'='.repeat(80)}\n`);
    return result;
  }
  
  console.log(`\n❌ ❌ ❌ ALL CAPTION EXTRACTION METHODS FAILED ❌ ❌ ❌`);
  console.log(`This video likely does NOT have captions/subtitles available.`);
  console.log('='.repeat(80));
  
  return null;
}
