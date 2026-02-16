import { Ollama } from "@langchain/ollama"

const llm = new Ollama({
  model: "llama3", // Default value
  temperature: 0,
  maxRetries: 2,
  // other params...
})



