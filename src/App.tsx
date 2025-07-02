import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar'
import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKResultMessage
} from '@anthropic-ai/claude-code'

// Define the types we need locally since @anthropic-ai/sdk is not available
interface ContentBlock {
  type: string
  [key: string]: unknown
}

interface TextBlock extends ContentBlock {
  type: 'text'
  text: string
}

// Type guard to check if a content block is a text block
function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === 'text'
}

interface Message {
  id: string
  content: string
  sender: 'user' | 'assistant'
  timestamp?: number
}

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isInitialized, setIsInitialized] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [isCheckingStatus, setIsCheckingStatus] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [devServerUrl, setDevServerUrl] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Check initialization status on app load
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch('/api/status')
        if (response.ok) {
          const status = await response.json()
          if (status.isInitialized) {
            setIsInitialized(true)
            // Set dev server URL if available
            if (status.devServerUrl) {
              setDevServerUrl(status.devServerUrl)
            }
            // Restore message history if available
            if (status.messages && status.messages.length > 0) {
              setMessages(status.messages)
            }
          }
        }
      } catch (error) {
        console.error('Failed to check status:', error)
      } finally {
        setIsCheckingStatus(false)
      }
    }

    checkStatus()
  }, [])

  const handleInitialize = async () => {
    setIsInitializing(true)
    try {
      const response = await fetch('/api/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (response.ok) {
        setIsInitialized(true)
        // Set dev server URL if available
        if (data.devServerUrl) {
          setDevServerUrl(data.devServerUrl)
        }
        const successMessage: Message = {
          id: Date.now().toString(),
          content: 'Project initialized successfully! You can now start coding.',
          sender: 'assistant'
        }
        setMessages([successMessage])
      } else {
        const errorMessage: Message = {
          id: Date.now().toString(),
          content: `Initialization failed: ${data.error || 'Unknown error'}`,
          sender: 'assistant'
        }
        setMessages([errorMessage])
      }
    } catch {
      const errorMessage: Message = {
        id: Date.now().toString(),
        content: 'Error: Failed to initialize project',
        sender: 'assistant'
      }
      setMessages([errorMessage])
    } finally {
      setIsInitializing(false)
    }
  }

  const handleSend = async () => {
    if (inputValue.trim() && !isSending) {
      const messageToSend = inputValue
      const newMessage: Message = {
        id: Date.now().toString(),
        content: messageToSend,
        sender: 'user'
      }

      // Clear input immediately and add user message
      setInputValue('')
      setMessages(prev => [...prev, newMessage])
      setIsSending(true)

      // Create a placeholder assistant message that will be updated with streaming content
      const assistantMessageId = (Date.now() + 1).toString()
      const initialAssistantMessage: Message = {
        id: assistantMessageId,
        content: '',
        sender: 'assistant'
      }
      setMessages(prev => [...prev, initialAssistantMessage])

      try {
        const response = await fetch('/api/run-code', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: messageToSend }),
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No response body reader available')
        }

        const decoder = new TextDecoder()
        let buffer = ''
        let assistantContent = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            break
          }

          const chunk = decoder.decode(value, { stream: true })
          buffer += chunk
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data: SDKMessage = JSON.parse(line.slice(6))

                if (data.type === 'assistant') {
                  const assistantMsg = data as SDKAssistantMessage
                  // Extract text content from Claude message using proper types
                  const textBlocks = assistantMsg.message.content?.filter(isTextBlock) || []

                  const textContent = textBlocks.map((block: TextBlock) => block.text).join('')

                  if (textContent) {
                    assistantContent += textContent
                    setMessages(prev => prev.map(msg =>
                      msg.id === assistantMessageId
                        ? { ...msg, content: assistantContent }
                        : msg
                    ))
                  }
                } else if (data.type === 'result') {
                  const resultMsg = data as SDKResultMessage
                  // Final result message - only use if we haven't received streaming content
                  if ('result' in resultMsg && resultMsg.result && !assistantContent) {
                    assistantContent = resultMsg.result
                    setMessages(prev => prev.map(msg =>
                      msg.id === assistantMessageId
                        ? { ...msg, content: assistantContent }
                        : msg
                    ))
                  }
                } else if (data.type === 'system') {
                  // System messages (like 'thinking', 'done', etc.)
                } else if (data.type === 'user') {
                  // User echo messages
                } else {
                  // Other message types
                }
              } catch (e) {
                console.error('Failed to parse streaming message:', e)
              }
            }
          }
        }

        // If we didn't get any content, show a default message
        if (!assistantContent) {
          setMessages(prev => prev.map(msg =>
            msg.id === assistantMessageId
              ? { ...msg, content: 'Claude task completed (no text output)' }
              : msg
          ))
        }

      } catch (error) {
        console.error('Streaming error:', error)
        const errorMessage = `Error: Failed to connect to sandbox - ${error instanceof Error ? error.message : 'Unknown error'}`
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? { ...msg, content: errorMessage }
            : msg
        ))
      } finally {
        setIsSending(false)
      }
    }
  }

  const handleResetSession = async () => {
    try {
      const response = await fetch('/api/reset-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        setMessages([])
        setDevServerUrl(null)
      } else {
        const data = await response.json()
        const errorMessage: Message = {
          id: Date.now().toString(),
          content: `Failed to reset session: ${data.error}`,
          sender: 'assistant'
        }
        setMessages(prev => [...prev, errorMessage])
      }
    } catch {
      const errorMessage: Message = {
        id: Date.now().toString(),
        content: 'Error: Failed to reset session',
        sender: 'assistant'
      }
      setMessages(prev => [...prev, errorMessage])
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isSending) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      setMessages([])
    }
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full dark">
        <Sidebar className="border-r">
          <SidebarContent className="flex flex-col h-full">
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Nightona</h2>
                {isInitialized && (
                  <Button variant="outline" size="sm" onClick={handleResetSession}>
                    Reset Session
                  </Button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`p-3 rounded-lg max-w-[90%] ${
                    message.sender === 'user'
                      ? 'bg-primary text-primary-foreground ml-auto'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {message.content}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t">
              <div className="flex flex-col gap-2 rounded-2xl border border-border bg-background p-3">
                <Textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isInitialized ? "Type your message..." : "Initialize project first..."}
                  className="resize-none bg-transparent border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[40px] w-full p-0"
                  rows={1}
                  disabled={!isInitialized || isSending}
                />
                <div className="flex justify-end">
                  <Button
                    onClick={handleSend}
                    size="icon"
                    disabled={!isInitialized || isSending || !inputValue.trim()}
                    className="h-6 w-6 rounded-full shrink-0 bg-foreground text-background hover:bg-foreground/90"
                  >
                    {isSending ? (
                      <div className="animate-spin h-3 w-3 border-2 border-background border-t-transparent rounded-full" />
                    ) : (
                      <svg
                        className="h-3 w-3"
                        fill="currentColor"
                        viewBox="0 -960 960 960"
                      >
                        <path d="M442.39-616.87 309.78-487.26q-11.82 11.83-27.78 11.33t-27.78-12.33q-11.83-11.83-11.83-27.78 0-15.96 11.83-27.79l198.43-199q11.83-11.82 28.35-11.82t28.35 11.82l198.43 199q11.83 11.83 11.83 27.79 0 15.95-11.83 27.78-11.82 11.83-27.78 11.83t-27.78-11.83L521.61-618.87v348.83q0 16.95-11.33 28.28-11.32 11.33-28.28 11.33t-28.28-11.33q-11.33-11.33-11.33-28.28z"/>
                      </svg>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </SidebarContent>
        </Sidebar>

        <SidebarInset className="flex items-center justify-center">
          {isCheckingStatus ? (
            <div className="text-2xl font-semibold text-muted-foreground">
              Checking project status...
            </div>
          ) : !isInitialized ? (
            <div className="flex flex-col items-center space-y-4">
              <div className="text-2xl font-semibold text-muted-foreground">
                Welcome to Nightona
              </div>
              <div className="text-muted-foreground text-center max-w-md">
                Initialize your project to start building with Claude Code and a React + TypeScript template.
              </div>
              <Button
                onClick={handleInitialize}
                disabled={isInitializing}
                className="px-8 py-6 text-lg"
              >
                {isInitializing ? 'Initializing...' : 'Initialize Project'}
              </Button>
            </div>
          ) : devServerUrl ? (
            <div className="w-full h-full flex flex-col">
              <div className="p-4 border-b bg-background">
                <h2 className="text-lg font-semibold text-foreground">Live Preview</h2>
                <p className="text-sm text-muted-foreground">
                  Your React app is running live. Changes made by Claude will appear here automatically.
                </p>
              </div>
              <iframe
                src={devServerUrl}
                className="flex-1 border-0 w-full"
                title="Live Preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              />
            </div>
          ) : (
            <div className="text-4xl font-bold text-foreground">
              Project Ready
            </div>
          )}
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}

export default App
