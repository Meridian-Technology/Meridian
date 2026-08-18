#!/usr/bin/env node
/**
 * Seed Luma and Partiful city slugs for pivot tenants (Task 1.1).
 * 
 * This migration sets the validated city slugs for the three pivot tenants:
 * - sf: lumaSlug="sf", partifulSlug="sf"
 * - nyc: lumaSlug="nyc", partifulSlug="nyc" 
 * - ic: lumaSlug=null, partifulSlug=null (no city pages exist)
 *
 * Usage:
 *   node migrations/seedPivotDiscoveryConfigSlugs.js [--dry-run]
 *
 * With --dry-run, shows what would be updated without persisting changes.
 */

require('./ensureBackendNodeModules');
require('dotenv').config();

const { connectToGlobalDatabase } = require('../connectionsManager');
const { validatePivotDiscoveryConfigPatch } = require('../utilities/pivotDiscoveryConfig');
const { updateCityDiscoveryConfig } = require('../services/pivotSourceDiscoveryService');

// Validated slug mappings from research
const SLUG_MAPPINGS = {
  sf: {
    city: 'San Francisco, California',
    lumaSlug: 'sf',
    partifulSlug: 'sf',
    notes: 'Both platforms have active city discover pages'
  },
  nyc: {
    city: 'New York City, New York', 
    lumaSlug: 'nyc',
    partifulSlug: 'nyc',
    notes: 'Both platforms have active city discover pages'
  },
  ic: {
    city: 'Iowa City, Iowa',
    lumaSlug: null,
    partifulSlug: null,
    notes: 'Neither platform has dedicated city pages (long-tail city)'
  }
};

async function seedPivotDiscoverySlugs(isDryRun = false) {
  const globalDb = await connectToGlobalDatabase();
  const mockReq = { globalDb, user: { email: 'migration-seedPivotDiscoverySlugs' } };
  
  console.log('\n[seed-pivot-discovery-slugs] Seeding city slugs for pivot tenants\n');
  
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - no changes will be persisted\n');
  }

  for (const [tenantKey, config] of Object.entries(SLUG_MAPPINGS)) {
    try {
      console.log(`📍 ${tenantKey.toUpperCase()}: ${config.city}`);
      
      // Prepare patch
      const patch = {
        lumaSlug: config.lumaSlug,
        partifulSlug: config.partifulSlug
      };
      
      // Validate patch first
      const validation = validatePivotDiscoveryConfigPatch(patch);
      if (validation.error) {
        console.log(`   ❌ Validation failed: ${validation.error}`);
        continue;
      }
      
      if (isDryRun) {
        console.log(`   📝 Would update: luma=${config.lumaSlug || 'null'}, partiful=${config.partifulSlug || 'null'}`);
        console.log(`   📝 Notes: ${config.notes}`);
      } else {
        // Use the existing discovery config update service
        const result = await updateCityDiscoveryConfig(mockReq, {
          tenantKey,
          patch
        });
        
        if (result.success) {
          console.log(`   ✅ Updated: luma=${config.lumaSlug || 'null'}, partiful=${config.partifulSlug || 'null'}`);
          console.log(`   📄 Notes: ${config.notes}`);
        } else {
          console.log(`   ❌ Update failed: ${result.message} (${result.code})`);
        }
      }

    } catch (err) {
      console.log(`   ❌ Error updating ${tenantKey}: ${err.message}`);
    }
    
    console.log('');
  }
  
  if (isDryRun) {
    console.log('🔍 Dry run complete. Run without --dry-run to apply changes.\n');
  } else {
    console.log('✅ Slug seeding complete!\n');
  }
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  
  try {
    await seedPivotDiscoverySlugs(isDryRun);
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { seedPivotDiscoverySlugs };