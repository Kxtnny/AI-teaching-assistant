import { ChatMessage } from "./types";

type Listener = (message: ChatMessage) => void;

class ChatRoom {
  private messages: ChatMessage[] = [];
  private listeners: Set<Listener> = new Set();

  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  addMessage(message: ChatMessage): void {
    this.messages.push(message);
    // Broadcast to all connected SSE clients
    this.listeners.forEach((listener) => listener(message));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getRecentMessages(count: number = 20): ChatMessage[] {
    return this.messages.slice(-count);
  }

  getStudentMessagesSinceLastFacilitator(): ChatMessage[] {
    const msgs = [...this.messages];
    let lastFacIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "facilitator") {
        lastFacIdx = i;
        break;
      }
    }
    return msgs.slice(lastFacIdx + 1);
  }
}

// Singleton — persists across API calls in dev/prod (same process)
const globalForChat = globalThis as unknown as { chatRoom: ChatRoom };
export const chatRoom = globalForChat.chatRoom || new ChatRoom();
globalForChat.chatRoom = chatRoom;