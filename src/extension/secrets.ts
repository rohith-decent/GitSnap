import * as vscode from 'vscode';

const API_KEY_SECRET_KEY = 'gitsnap.apiKey';
const MODEL_SECRET_KEY = 'gitsnap.model';

// Store the API key securely
export async function storeApiKey(
  context: vscode.ExtensionContext,
  apiKey: string
): Promise<void> {
  await context.secrets.store(API_KEY_SECRET_KEY, apiKey);
}

// Retrieve the API key
export async function getApiKey(
  context: vscode.ExtensionContext
): Promise<string | undefined> {
  return await context.secrets.get(API_KEY_SECRET_KEY);
}

// Delete the API key
export async function deleteApiKey(
  context: vscode.ExtensionContext
): Promise<void> {
  await context.secrets.delete(API_KEY_SECRET_KEY);
}

// Store the selected model
export async function storeModel(
  context: vscode.ExtensionContext,
  model: string
): Promise<void> {
  await context.secrets.store(MODEL_SECRET_KEY, model);
}

// Retrieve the selected model
export async function getModel(
  context: vscode.ExtensionContext
): Promise<string> {
  const model = await context.secrets.get(MODEL_SECRET_KEY);
  // Updated to the latest recommended Flash model
  return model || 'gemini-3.6-flash'; 
}