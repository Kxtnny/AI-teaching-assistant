export interface ChatMessage {
  id: string;
  role: "student" | "facilitator";
  username: string;
  content: string;
  timestamp: number;
}
