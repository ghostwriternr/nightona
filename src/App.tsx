import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
} from '@/components/ui/sidebar'

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
      setMessages([...messages, newMessage])
      setIsSending(true)

      try {
        const response = await fetch('/api/run-code', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: messageToSend }),
        })

        const data = await response.json()

        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: data.result || data.error || 'No response from sandbox',
          sender: 'assistant'
        }
        setMessages(prev => [...prev, aiMessage])
      } catch {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: 'Error: Failed to connect to sandbox',
          sender: 'assistant'
        }
        setMessages(prev => [...prev, errorMessage])
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
        <Sidebar className="w-80 border-r">
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

            <div className="p-4 border-t space-y-2">
              <Textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isInitialized ? "Type your message..." : "Initialize project first..."}
                className="resize-none"
                rows={3}
                disabled={!isInitialized || isSending}
              />
              <Button onClick={handleSend} className="w-full" disabled={!isInitialized || isSending}>
                {isSending ? 'Working...' : 'Send'}
              </Button>
            </div>
          </SidebarContent>
        </Sidebar>

        <main className="flex-1 flex items-center justify-center bg-background">
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
          ) : (
            <div className="text-4xl font-bold text-foreground">
              Project Ready
            </div>
          )}
        </main>
      </div>
    </SidebarProvider>
  )
}

export default App
