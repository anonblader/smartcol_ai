/**
 * Test Authentication Flow
 *
 * Tests OAuth URL generation and Graph API client without database
 */

import { config } from './src/config/env';
import { graphClient } from './src/services/graph.client';

async function testAuthFlow() {
  console.log('\n=== Testing SmartCol AI Authentication Flow ===\n');

  // Test 1: Configuration
  console.log('1. Testing Configuration...');
  console.log(`   Environment: ${config.env}`);
  console.log(`   Port: ${config.port}`);
  console.log(`   Azure AD Client ID: ${config.azure.clientId}`);
  console.log(`   Redirect URI: ${config.azure.redirectUri}`);
  console.log(`   ✅ Configuration loaded\n`);

  // Test 2: OAuth URL Generation
  console.log('2. Testing OAuth URL Generation...');
  const testState = 'test-state-123';
  const authUrl = graphClient.getAuthUrl(testState);
  console.log(`   Generated Auth URL: ${authUrl.substring(0, 100)}...`);
  console.log(`   ✅ OAuth URL generated\n`);

  // Test 3: Check if URL contains required parameters
  console.log('3. Validating OAuth URL Parameters...');
  const url = new URL(authUrl);
  const checks = [
    { param: 'client_id', value: url.searchParams.get('client_id') },
    { param: 'redirect_uri', value: url.searchParams.get('redirect_uri') },
    { param: 'response_type', value: url.searchParams.get('response_type') },
    { param: 'scope', value: url.searchParams.get('scope') },
    { param: 'state', value: url.searchParams.get('state') },
  ];

  let allValid = true;
  for (const check of checks) {
    if (check.value) {
      console.log(`   ✅ ${check.param}: ${check.value.substring(0, 50)}${check.value.length > 50 ? '...' : ''}`);
    } else {
      console.log(`   ❌ ${check.param}: MISSING`);
      allValid = false;
    }
  }

  if (!allValid) {
    console.log('\n❌ OAuth URL validation failed');
    process.exit(1);
  }

  console.log('\n=== All Tests Passed ===\n');
  console.log('Next Steps:');
  console.log('1. Start PostgreSQL (Docker or local)');
  console.log('2. Run database migration: npm run db:migrate:init');
  console.log('3. Start the server: npm run dev');
  console.log('4. Test OAuth flow: GET http://localhost:3001/api/auth/connect');
  console.log('5. Follow the returned authUrl to authorize');
  console.log('\nTo test the complete flow, you need:');
  console.log('- PostgreSQL running on localhost:5432');
  console.log('- Database "smartcol" created');
  console.log('- Valid Azure AD app registration with correct redirect URI');
}

// Run tests
testAuthFlow().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
