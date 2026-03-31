import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { AIAgentDTO, CreateAgentDTO, ChatMessage } from '../../interfaces';
import { OpenAICompatibleClient } from '../../client/openai-compatible';

/**
 * Agent Service
 * Creates and manages AI agent instances
 * Each agent is bound to a specific model and optionally a session
 */
@Injectable()
export class AgentService {
  private agents: Map<string, AIAgentDTO> = new Map();
  private agentClients: Map<string, OpenAICompatibleClient> = new Map();
  private agentContexts: Map<string, ChatMessage[]> = new Map();

  /**
   * Create a new AI agent instance
   */
  async createAgent(dto: CreateAgentDTO, client?: OpenAICompatibleClient): Promise<AIAgentDTO> {
    const id = uuidv4();
    const now = new Date();

    const agent: AIAgentDTO = {
      id,
      model_id: dto.model_id,
      session_id: dto.session_id,
      status: 'idle',
      created_at: now,
    };

    this.agents.set(id, agent);

    // Store client if provided
    if (client) {
      this.agentClients.set(id, client);
    }

    // Initialize empty context for chat history
    this.agentContexts.set(id, []);

    return agent;
  }

  /**
   * Get an agent by ID
   */
  async getAgent(id: string): Promise<AIAgentDTO | null> {
    return this.agents.get(id) || null;
  }

  /**
   * List agents by session ID
   */
  async listAgentsBySession(sessionId: string): Promise<AIAgentDTO[]> {
    return Array.from(this.agents.values()).filter(
      (agent) => agent.session_id === sessionId,
    );
  }

  /**
   * List agents by model ID
   */
  async listAgentsByModel(modelId: string): Promise<AIAgentDTO[]> {
    return Array.from(this.agents.values()).filter(
      (agent) => agent.model_id === modelId,
    );
  }

  /**
   * Set agent client for chat operations
   */
  setAgentClient(id: string, client: OpenAICompatibleClient): void {
    this.agentClients.set(id, client);
  }

  /**
   * Get agent client
   */
  getAgentClient(id: string): OpenAICompatibleClient | null {
    return this.agentClients.get(id) || null;
  }

  /**
   * Update agent status
   */
  async setAgentStatus(id: string, status: 'idle' | 'active' | 'error'): Promise<AIAgentDTO | null> {
    const agent = this.agents.get(id);
    if (!agent) return null;

    const updatedAgent: AIAgentDTO = {
      ...agent,
      status,
    };

    this.agents.set(id, updatedAgent);
    return updatedAgent;
  }

  /**
   * Send a message through the agent
   * Maintains conversation context
   */
  async sendMessage(id: string, message: string, systemPrompt?: string): Promise<string> {
    const client = this.agentClients.get(id);
    if (!client) {
      throw new Error('Agent client not initialized');
    }

    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error('Agent not found');
    }

    // Update status to active
    await this.setAgentStatus(id, 'active');

    // Build message history
    const context = this.agentContexts.get(id) || [];
    const messages: ChatMessage[] = [];

    // Add system prompt if provided and context is empty
    if (systemPrompt && context.length === 0) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // Add existing context
    messages.push(...context);

    // Add new user message
    messages.push({ role: 'user', content: message });

    try {
      const response = await client.chatCompletion(messages);

      // Add response to context
      context.push({ role: 'user', content: message });
      context.push({ role: 'assistant', content: response });
      this.agentContexts.set(id, context);

      // Update status back to idle
      await this.setAgentStatus(id, 'idle');

      return response;
    } catch (error) {
      await this.setAgentStatus(id, 'error');
      throw error;
    }
  }

  /**
   * Clear agent conversation context
   */
  clearContext(id: string): void {
    this.agentContexts.set(id, []);
  }

  /**
   * Get agent conversation context
   */
  getContext(id: string): ChatMessage[] {
    return this.agentContexts.get(id) || [];
  }

  /**
   * Delete an agent
   */
  async deleteAgent(id: string): Promise<boolean> {
    const exists = this.agents.has(id);
    if (exists) {
      this.agents.delete(id);
      this.agentClients.delete(id);
      this.agentContexts.delete(id);
    }
    return exists;
  }

  /**
   * Bind agent to a session
   */
  async bindToSession(id: string, sessionId: string): Promise<AIAgentDTO | null> {
    const agent = this.agents.get(id);
    if (!agent) return null;

    const updatedAgent: AIAgentDTO = {
      ...agent,
      session_id: sessionId,
    };

    this.agents.set(id, updatedAgent);
    return updatedAgent;
  }

  /**
   * Unbind agent from session
   */
  async unbindFromSession(id: string): Promise<AIAgentDTO | null> {
    const agent = this.agents.get(id);
    if (!agent) return null;

    const updatedAgent: AIAgentDTO = {
      ...agent,
      session_id: undefined,
    };

    this.agents.set(id, updatedAgent);
    return updatedAgent;
  }
}