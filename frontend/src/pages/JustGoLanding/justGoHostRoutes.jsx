import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { JUSTGO_CREATOR_ROUTES } from '../JustGoCreator/justGoCreatorRoutes';
import JustGoLanding from './JustGoLanding';
import { landingTenantKeyFromParam, normalizeLandingTenantKey } from './justGoLandingUtils';

/**
 * justgo.lol/{city} — only non-reserved slugs are cities.
 * `creator` aliases the existing console prefix so the slug is not eaten.
 */
export function JustGoApexCityLanding() {
  const { tenantKey } = useParams();
  const city = landingTenantKeyFromParam(tenantKey);
  if (city) return <JustGoLanding />;
  if (normalizeLandingTenantKey(tenantKey) === 'creator') {
    return <Navigate to={JUSTGO_CREATOR_ROUTES.home} replace />;
  }
  return <Navigate to="/" replace />;
}

/**
 * justgo.lol/clip/{city}[/{tag}] — App Clip links on NFC tags and QR codes.
 * iPhones open the clip; everything else lands on that city's page.
 */
export function JustGoClipFallback() {
  const { tenantKey } = useParams();
  const { search } = useLocation();
  const city = landingTenantKeyFromParam(tenantKey);
  return <Navigate to={city ? `/${city}${search}` : `/${search}`} replace />;
}
