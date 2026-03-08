import React from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import {
  Box,
  CircularProgress,
  Typography,
  Button,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import BarChartIcon from '@mui/icons-material/BarChart';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import SettingsIcon from '@mui/icons-material/Settings';
import MicrosoftIcon from '@mui/icons-material/Microsoft';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import { useAuth } from './hooks/useAuth';
import { authApi } from './services/api';
import { Dashboard } from './pages/Dashboard';
import { Analytics } from './pages/Analytics';
import { Risks } from './pages/Risks';
import { Settings } from './pages/Settings';

const SIDEBAR_WIDTH = 240;
const PRIMARY = '#2563eb';
const SIDEBAR_BG = '#1e293b';

const navItems = [
  { label: 'Dashboard', path: '/', icon: <DashboardIcon /> },
  { label: 'Analytics', path: '/analytics', icon: <BarChartIcon /> },
  { label: 'Risks', path: '/risks', icon: <WarningAmberIcon /> },
  { label: 'Settings', path: '/settings', icon: <SettingsIcon /> },
];

function LoginPage() {
  const handleLogin = async () => {
    try {
      const res = await authApi.getConnectUrl();
      const authUrl = res.data.authUrl || res.data.url || res.data;
      if (typeof authUrl === 'string') {
        window.location.href = authUrl;
      }
    } catch (err) {
      console.error('Failed to get auth URL', err);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      }}
    >
      <Box
        sx={{
          background: '#fff',
          borderRadius: 3,
          p: 6,
          maxWidth: 420,
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <Box
          sx={{
            width: 60,
            height: 60,
            borderRadius: 2,
            background: PRIMARY,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 3,
          }}
        >
          <BarChartIcon sx={{ color: '#fff', fontSize: 32 }} />
        </Box>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          SmartCol AI
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          Intelligent workload analytics for your Microsoft Outlook calendar.
          Sign in to get started.
        </Typography>
        <Button
          variant="contained"
          size="large"
          fullWidth
          startIcon={<MicrosoftIcon />}
          onClick={handleLogin}
          sx={{
            background: PRIMARY,
            py: 1.5,
            fontWeight: 600,
            '&:hover': { background: '#1d4ed8' },
          }}
        >
          Sign in with Microsoft
        </Button>
      </Box>
    </Box>
  );
}

function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Box
      sx={{
        width: SIDEBAR_WIDTH,
        minHeight: '100vh',
        background: SIDEBAR_BG,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <Box sx={{ p: 3, pb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1.5,
              background: PRIMARY,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BarChartIcon sx={{ color: '#fff', fontSize: 20 }} />
          </Box>
          <Typography variant="subtitle1" fontWeight={700} color="#fff">
            SmartCol AI
          </Typography>
        </Box>
      </Box>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mx: 2 }} />

      {/* Nav */}
      <List sx={{ px: 1, pt: 2, flex: 1 }}>
        {navItems.map((item) => (
          <ListItemButton
            key={item.path}
            component={NavLink}
            to={item.path}
            end={item.path === '/'}
            sx={{
              borderRadius: 1.5,
              mb: 0.5,
              color: 'rgba(255,255,255,0.65)',
              '&.active': {
                background: 'rgba(37,99,235,0.3)',
                color: '#fff',
                '& .MuiListItemIcon-root': { color: PRIMARY },
              },
              '&:hover': {
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
              },
            }}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>
              {item.icon}
            </ListItemIcon>
            <ListItemText
              primary={item.label}
              primaryTypographyProps={{ fontSize: 14, fontWeight: 500 }}
            />
          </ListItemButton>
        ))}
      </List>

      {/* Admin Panel link — only shown for admins */}
      {isAdmin && (
        <>
          <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mx: 2 }} />
          <Box sx={{ px: 1.5, py: 1.5 }}>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', px: 1, display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Admin
            </Typography>
            {[
              { label: 'Auth & Users',     href: 'http://localhost:3001/test-auth.html' },
              { label: 'Sync Testing',     href: 'http://localhost:3001/test-sync.html' },
              { label: 'Analytics Panel',  href: 'http://localhost:3001/test-analytics.html' },
              { label: 'Multi-User Test',  href: 'http://localhost:3001/test-multiuser.html' },
            ].map((link) => (
              <ListItemButton
                key={link.href}
                component="a"
                href={link.href}
                target="_blank"
                sx={{
                  borderRadius: 1.5,
                  mb: 0.25,
                  py: 0.75,
                  color: '#93c5fd',
                  '&:hover': { background: 'rgba(147,197,253,0.1)', color: '#bfdbfe' },
                }}
              >
                <ListItemIcon sx={{ color: 'inherit', minWidth: 30 }}>
                  <OpenInNewIcon sx={{ fontSize: 14 }} />
                </ListItemIcon>
                <ListItemText
                  primary={link.label}
                  primaryTypographyProps={{ fontSize: 12, fontWeight: 500 }}
                />
              </ListItemButton>
            ))}
          </Box>
        </>
      )}

      <Box sx={{ p: 2 }}>
        <Typography variant="caption" color="rgba(255,255,255,0.3)">
          v1.0.0 — Capstone Demo
        </Typography>
      </Box>
    </Box>
  );
}

export default function App() {
  const { authenticated, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
        }}
      >
        <CircularProgress sx={{ color: PRIMARY }} />
      </Box>
    );
  }

  if (!authenticated) {
    return <LoginPage />;
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', background: '#f1f5f9' }}>
      <Sidebar isAdmin={isAdmin} />
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/risks" element={<Risks />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Box>
    </Box>
  );
}
