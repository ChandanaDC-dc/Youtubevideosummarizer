import { useState } from 'react';
import { Youtube, Sparkles, FileText, Clock, Loader2, CheckCircle2, XCircle, Play, BookOpen, AlignLeft } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface VideoInfo {
  title: string;
  description: string;
  thumbnail: string;
  channelTitle: string;
}

interface SummaryResult {
  summary: string;
  keyPoints: string[];
  isAiGenerated: boolean;
}

export function VideoSummarizer() {
  const [videoUrl, setVideoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [transcript, setTranscript] = useState('');
  const [summaryResult, setSummaryResult] = useState<SummaryResult | null>(null);
  const [processingStep, setProcessingStep] = useState('');
  const [usedDescription, setUsedDescription] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [estimatedReadingTime, setEstimatedReadingTime] = useState(0);
  const [contentSource, setContentSource] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const tryDemoVideo = () => {
    // This is a popular video that definitely has captions
    setVideoUrl('https://www.youtube.com/watch?v=fNk_zzaMoSs');
    setError('');
    setTestResult(null);
  };

  const testCaptionExtraction = async () => {
    if (!videoUrl.trim()) {
      setError('Please enter a YouTube URL to test');
      return;
    }

    setTesting(true);
    setError('');
    setTestResult(null);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-7494be05/test-captions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ videoUrl }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Test failed');
      }

      setTestResult(data);
      console.log('Caption test result:', data);
    } catch (err) {
      console.error('Test error:', err);
      setError(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSummarize = async () => {
    if (!videoUrl.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    setLoading(true);
    setError('');
    setVideoInfo(null);
    setTranscript('');
    setSummaryResult(null);
    setUsedDescription(false);
    setWordCount(0);
    setEstimatedReadingTime(0);
    setContentSource('');
    setProcessingStep('Fetching video information...');

    try {
      // Step 1: Get transcript
      const transcriptResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-7494be05/get-transcript`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ videoUrl }),
        }
      );

      const transcriptData = await transcriptResponse.json();

      if (!transcriptResponse.ok) {
        // Handle rate limiting specifically
        if (transcriptResponse.status === 429 || transcriptData.errorType === 'RATE_LIMITED') {
          throw new Error('⏳ YouTube is rate-limiting requests. Please wait a few minutes before trying again, or try a different video.');
        }
        throw new Error(transcriptData.error || 'Failed to fetch video transcript');
      }

      setVideoInfo(transcriptData.videoInfo);
      setTranscript(transcriptData.transcript);
      setUsedDescription(transcriptData.usedDescription || false);
      setWordCount(transcriptData.wordCount || 0);
      setEstimatedReadingTime(transcriptData.estimatedReadingTime || 0);
      setContentSource(transcriptData.source || 'unknown');
      setProcessingStep('Generating AI summary...');

      // Step 2: Generate summary
      const summaryResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-7494be05/summarize`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            transcript: transcriptData.transcript,
            videoTitle: transcriptData.videoInfo.title,
            source: transcriptData.source,
          }),
        }
      );

      const summaryData = await summaryResponse.json();

      if (!summaryResponse.ok) {
        throw new Error(summaryData.error || 'Failed to generate summary');
      }

      setSummaryResult(summaryData);
      setProcessingStep('');
    } catch (err) {
      console.error('Error during summarization:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleSummarize();
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="p-3 bg-gradient-to-br from-red-500 to-pink-600 rounded-2xl shadow-lg">
            <Youtube className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-pink-600">
            YouTube Audio-to-Text Summarizer
          </h1>
        </div>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Convert YouTube video <strong>audio to text</strong> by extracting captions/subtitles, then get an AI-powered summary with key insights.
        </p>
        <div className="mt-3 inline-flex items-center gap-2 bg-green-100 px-4 py-2 rounded-full text-sm text-green-800 border border-green-300">
          <span className="text-lg">🔊</span>
          <span>Audio</span>
          <span className="text-green-600">→</span>
          <span>📝</span>
          <span>Text</span>
        </div>
      </div>

      {/* How it Works Section */}
      <Card className="mb-6 border-green-200 bg-green-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-green-900 mb-2">🎤 Audio-to-Text: How It Works</h3>
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg mb-3">
                <p className="text-xs font-semibold text-blue-900 mb-1">💡 What this tool does:</p>
                <p className="text-xs text-blue-800">
                  Converts YouTube video <strong>AUDIO (what people say)</strong> into <strong>TEXT</strong> by downloading captions/subtitles, 
                  then uses AI to create a summary.
                </p>
              </div>
              <div className="space-y-2 text-sm text-green-800">
                <p>
                  <strong>1. Audio → Text Conversion:</strong> YouTube's captions are the video's audio transcribed to text (speech recognition). We download these captions.
                </p>
                <p>
                  <strong>2. Extract Text:</strong> The captions contain every word spoken in the video's audio - dialogue, narration, speech.
                </p>
                <p>
                  <strong>3. AI Summary:</strong> The text transcript is sent to OpenAI to generate an intelligent summary with key points.
                </p>
                <div className="bg-white p-3 rounded border border-green-300 mt-3">
                  <p className="text-xs font-semibold text-green-900 mb-2">📝 Audio → Text Example:</p>
                  <div className="space-y-2">
                    <div>
                      <p className="text-[10px] text-green-700 mb-1 flex items-center gap-1">
                        🔊 <strong>Video Audio (what you HEAR):</strong>
                      </p>
                      <div className="bg-green-50 p-2 rounded text-[11px] font-mono italic">
                        "Hello everyone, today we're going to learn about artificial intelligence and how it's changing the world..."
                      </div>
                    </div>
                    <div className="flex items-center justify-center py-1">
                      <div className="text-green-600 text-xs">⬇️ Converted to Text via Captions ⬇️</div>
                    </div>
                    <div>
                      <p className="text-[10px] text-blue-700 mb-1 flex items-center gap-1">
                        📝 <strong>Text Output (what you GET):</strong>
                      </p>
                      <div className="bg-blue-50 p-2 rounded text-[11px] font-mono border border-blue-200">
                        "Hello everyone, today we're going to learn about artificial intelligence and how it's changing the world..."
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-green-600 mt-2 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    YouTube captions = Audio transcribed to text. We download those captions = We get the audio as text!
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Input Section */}
      <Card className="mb-8 border-2 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="w-5 h-5 text-red-500" />
            Enter YouTube URL
          </CardTitle>
          <CardDescription>
            Paste any YouTube video URL - we'll convert the video's audio (what people say) into text
            <div className="flex items-start gap-2 mt-2 text-xs bg-blue-50 p-2 rounded border border-blue-100">
              <BookOpen className="w-3 h-3 text-blue-600 mt-0.5 flex-shrink-0" />
              <span className="text-blue-700">
                <strong>How it works:</strong> YouTube captions = Audio transcribed to text. We download those captions to get the video's audio as text (dialogue, speech, narration).
              </span>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex gap-3">
              <Input
                type="text"
                placeholder="https://www.youtube.com/watch?v=..."
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={loading}
                className="flex-1"
              />
              <Button
                onClick={handleSummarize}
                disabled={loading}
                className="bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 min-w-[140px]"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Summarize
                  </>
                )}
              </Button>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="h-px bg-gray-200 flex-1" />
              <span className="text-xs text-gray-500">OR</span>
              <div className="h-px bg-gray-200 flex-1" />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={tryDemoVideo}
                disabled={loading || testing}
                variant="outline"
                className="border-red-200 hover:bg-red-50"
              >
                <Play className="w-4 h-4 mr-2 text-red-500" />
                Try Demo Video
              </Button>
              <Button
                onClick={testCaptionExtraction}
                disabled={loading || testing}
                variant="outline"
                className="border-blue-200 hover:bg-blue-50"
              >
                {testing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin text-blue-500" />
                    Converting...
                  </>
                ) : (
                  <>
                    <BookOpen className="w-4 h-4 mr-2 text-blue-500" />
                    Test Audio→Text
                  </>
                )}
              </Button>
            </div>
          </div>

          {processingStep && (
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="w-4 h-4 animate-spin text-red-500" />
              {processingStep}
            </div>
          )}

          {testResult && (
            <Alert className="mt-4 border-blue-200 bg-blue-50">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                <div className="space-y-3">
                  <p className="font-semibold">
                    {testResult.success ? '✅ Audio-to-Text Conversion SUCCESSFUL!' : '❌ Audio-to-Text Conversion FAILED'}
                  </p>
                  {testResult.success && (
                    <div className="bg-white p-3 rounded border border-blue-200 space-y-2">
                      <div className="bg-green-50 border border-green-200 p-2 rounded mb-2">
                        <p className="text-xs text-green-800 flex items-center gap-2">
                          <span className="text-base">🔊→📝</span>
                          <span>
                            <strong>VIDEO AUDIO CONVERTED TO TEXT:</strong> This is what people SAY in the video (audio transcribed via captions), NOT the video description.
                          </span>
                        </p>
                      </div>
                      <p className="text-sm">
                        <strong>Extraction Method:</strong> {testResult.method}
                        {testResult.apiKeyUsed && <span className="ml-2 text-green-600">✓ Using your YouTube API key</span>}
                      </p>
                      <p className="text-sm">
                        <strong>Language:</strong> {testResult.language}
                      </p>
                      <p className="text-sm">
                        <strong>Total Spoken Words:</strong> {testResult.transcriptLength?.toLocaleString()} characters
                      </p>
                      <div className="mt-2">
                        <p className="text-sm font-semibold mb-1">📝 Preview of audio converted to text:</p>
                        <div className="bg-gray-50 p-3 rounded border border-blue-100 text-xs max-h-32 overflow-y-auto font-mono">
                          "{testResult.preview}"
                        </div>
                        <p className="text-xs text-gray-600 mt-1 italic">
                          ↑ This text is what people say when you listen to the video audio
                        </p>
                      </div>
                      <div className="bg-yellow-50 border border-yellow-200 p-2 rounded mt-2">
                        <p className="text-xs text-yellow-800">
                          <strong>💡 How to verify:</strong> Play the video audio and check if the text above matches what you HEAR. If it does, the audio-to-text conversion is working correctly!
                        </p>
                      </div>
                    </div>
                  )}
                  {!testResult.success && (
                    <div className="space-y-2">
                      <p className="text-sm">{testResult.message}</p>
                      <p className="text-xs text-gray-600">This usually means the video doesn't have captions/subtitles available, or they're disabled by the uploader.</p>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert className="mt-4 border-red-200 bg-red-50">
              <XCircle className="w-4 h-4 text-red-600" />
              <AlertDescription className="text-red-800">
                <div className="space-y-3">
                  <p>{error}</p>
                  <div className="space-y-2">
                    <p className="text-sm text-red-600">
                      💡 <strong>Only videos with captions/subtitles can be summarized.</strong>
                    </p>
                    <div className="bg-white p-3 rounded border border-red-200">
                      <p className="text-sm text-red-600 mb-2">
                        ✅ <strong>Try one of these videos with captions:</strong>
                      </p>
                      <div className="text-xs text-red-700 space-y-2">
                        <div>
                          <p className="mb-1">🎯 <strong>Try these verified working videos:</strong></p>
                          <div className="space-y-1">
                            <div>
                              <p className="text-[10px] text-red-500 mb-0.5">Example 1 - Educational:</p>
                              <code className="bg-red-100 px-2 py-1 rounded block text-[10px] break-all">https://www.youtube.com/watch?v=fNk_zzaMoSs</code>
                            </div>
                            <div>
                              <p className="text-[10px] text-red-500 mb-0.5">Example 2 - Tech Review:</p>
                              <code className="bg-red-100 px-2 py-1 rounded block text-[10px] break-all">https://www.youtube.com/watch?v=ZQqjJFizBJo</code>
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-red-600 mt-2">
                          <p><strong>Channels that have captions:</strong></p>
                          <ul className="ml-4 mt-1 space-y-1 text-[11px]">
                            <li>✅ Kurzgesagt, Veritasium, VSauce</li>
                            <li>✅ Marques Brownlee (MKBHD), Linus Tech Tips</li>
                            <li>✅ TED, Khan Academy, Crash Course</li>
                            <li>✅ Major news channels (most videos)</li>
                          </ul>
                          <p className="mt-2 text-[11px]">
                            <strong>💡 Tip:</strong> Videos from popular creators with 100K+ subscribers usually have auto-captions.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}
          
          {!error && !videoInfo && !loading && (
            <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800 mb-2">
                💡 <strong>How this works:</strong>
              </p>
              <ul className="text-sm text-blue-700 ml-5 space-y-1 list-disc">
                <li>🔊→📝 <strong>Audio to Text:</strong> Converts video audio to text by downloading captions (what you hear becomes what you read)</li>
                <li>✅ <strong>Smart fallback:</strong> If no captions, uses video description</li>
                <li>✅ <strong>AI-powered:</strong> Creates intelligent summaries with key points</li>
              </ul>
              <p className="text-sm text-blue-700 mt-2">
                Try the demo video above to see it in action!
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Section */}
      {videoInfo && (
        <div className="space-y-6">
          {/* Video Info Card */}
          <Card className="overflow-hidden border-2 shadow-lg">
            <div className="grid md:grid-cols-3 gap-6">
              <div className="relative md:col-span-1 aspect-video md:aspect-auto">
                <ImageWithFallback
                  src={videoInfo.thumbnail}
                  alt={videoInfo.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="bg-white/90">
                      <Youtube className="w-3 h-3 mr-1" />
                      YouTube
                    </Badge>
                    {contentSource === 'captions' && (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-300">
                        🔊→📝 Audio Converted to Text
                      </Badge>
                    )}
                    {contentSource === 'description' && (
                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-300">
                        ⚠️ Description Only (No Audio-to-Text)
                      </Badge>
                    )}
                    {contentSource === 'metadata' && (
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-300">
                        From Metadata
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="md:col-span-2 p-6">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <h2 className="text-gray-900">{videoInfo.title}</h2>
                </div>
                <p className="text-gray-600 mb-3">{videoInfo.channelTitle}</p>
                {videoInfo.description && (
                  <p className="text-sm text-gray-500 line-clamp-3">
                    {videoInfo.description}
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* Summary Card */}
          {summaryResult && (
            <Card className="border-2 shadow-lg bg-gradient-to-br from-white to-purple-50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-600" />
                    AI Summary
                  </CardTitle>
                  {summaryResult.isAiGenerated && (
                    <Badge className="bg-purple-600">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      AI Powered
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  Here's what this video is about
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="prose prose-sm max-w-none">
                  <p className="text-gray-700 leading-relaxed">
                    {summaryResult.summary}
                  </p>
                </div>

                {summaryResult.keyPoints.length > 0 && (
                  <div>
                    <h3 className="flex items-center gap-2 text-gray-900 mb-4">
                      <FileText className="w-5 h-5 text-purple-600" />
                      Key Points
                    </h3>
                    <ul className="space-y-3">
                      {summaryResult.keyPoints.map((point, index) => (
                        <li
                          key={index}
                          className="flex items-start gap-3 bg-white p-4 rounded-lg border border-purple-100 shadow-sm"
                        >
                          <div className="flex-shrink-0 w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-sm">
                            {index + 1}
                          </div>
                          <span className="text-gray-700 flex-1">{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Transcript Card */}
          {transcript && (
            <Card className="border-2 shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-gray-600" />
                      {contentSource === 'captions' ? 'Full Audio-to-Text Transcript' : 'Full Content'}
                    </CardTitle>
                    <CardDescription>
                      {contentSource === 'captions' ? 'Video audio converted to readable text' : 'Complete video content'}
                    </CardDescription>
                  </div>
                  <div className="flex gap-3">
                    {wordCount > 0 && (
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <AlignLeft className="w-4 h-4" />
                          <span>{wordCount.toLocaleString()} words</span>
                        </div>
                      </div>
                    )}
                    {estimatedReadingTime > 0 && (
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Clock className="w-4 h-4" />
                          <span>{estimatedReadingTime} min read</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {contentSource === 'captions' && (
                  <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-800 mb-2">
                      ✅ <strong>Audio converted to text successfully!</strong> 
                    </p>
                    <p className="text-xs text-green-700 flex items-center gap-1">
                      <span>🔊 What you HEAR in the video</span>
                      <span className="text-green-600">→</span>
                      <span>📝 What you can READ below</span>
                    </p>
                  </div>
                )}
                {contentSource === 'description' && (
                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      ⚠️ <strong>Note:</strong> This video doesn't have captions available. Showing the video description instead. This is NOT audio-to-text conversion - it's just text written about the video.
                    </p>
                  </div>
                )}
                <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 max-h-[600px] overflow-y-auto">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {transcript}
                  </p>
                </div>
                <div className="mt-4 text-xs text-gray-500 text-center">
                  {transcript.length.toLocaleString()} characters • Scroll to read more
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Empty State */}
      {!videoInfo && !loading && (
        <div className="text-center py-16">
          <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-red-100 to-pink-100 rounded-full flex items-center justify-center">
            <Youtube className="w-12 h-12 text-red-500" />
          </div>
          <h3 className="text-gray-700 mb-2">No video summarized yet</h3>
          <p className="text-gray-500 max-w-md mx-auto mb-6">
            Enter a YouTube URL above to extract captions and generate an AI-powered summary
          </p>
          
          <Card className="max-w-2xl mx-auto mt-8 border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="text-sm">💡 Important: Video must have captions</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-left space-y-3">
              <p className="text-gray-700">
                This tool extracts the actual <strong>spoken transcript</strong> (what people say) from videos with closed captions/subtitles. 
                When watching on YouTube, look for the <strong>CC button</strong> in the video player.
              </p>
              <div className="bg-white p-3 rounded border border-blue-200">
                <p className="text-gray-700 mb-2">✨ Try these types of videos:</p>
                <ul className="list-disc list-inside space-y-1 text-gray-600">
                  <li>TED Talks and educational content</li>
                  <li>Popular tech channels and tutorials</li>
                  <li>News channels and documentaries</li>
                  <li>Official brand and conference videos</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
