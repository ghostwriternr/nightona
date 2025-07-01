#!/usr/bin/env node

import { Daytona, Image } from '@daytonaio/sdk';
import { readFileSync } from 'fs';

const CLAUDE_SNAPSHOT_NAME = "claude-code-env:1.0.0";

async function createSnapshot(): Promise<void> {
  try {
    // Check if .dev.vars exists and has DAYTONA_API_KEY
    let daytonaApiKey: string | undefined;
    try {
      const envVars = readFileSync('.dev.vars', 'utf8');
      const match = envVars.match(/DAYTONA_API_KEY=(.+)/);
      daytonaApiKey = match?.[1];
    } catch (error) {
      console.error('Error reading .dev.vars file:', (error as Error).message);
      process.exit(1);
    }

    if (!daytonaApiKey) {
      console.error('DAYTONA_API_KEY not found in .dev.vars');
      process.exit(1);
    }

    console.log('Initializing Daytona client...');
    const daytona = new Daytona({ apiKey: daytonaApiKey });

    console.log('Creating Claude Code snapshot from Dockerfile...');
    const claudeImage = Image.fromDockerfile("Dockerfile");

    await daytona.snapshot.create({
      name: CLAUDE_SNAPSHOT_NAME,
      image: claudeImage,
    }, {
      onLogs: (chunk: string) => console.log(chunk),
    });

    console.log(`✅ Snapshot "${CLAUDE_SNAPSHOT_NAME}" created successfully!`);
  } catch (error) {
    console.error('❌ Failed to create snapshot:', (error as Error).message);
    process.exit(1);
  }
}

createSnapshot();
