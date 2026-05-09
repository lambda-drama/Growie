/**
 * Re-exports the useAuth hook from AuthProvider so that components can import
 * from a consistent hooks path without knowing about the providers directory.
 *
 *   import { useAuth } from '@/hooks/use-auth'
 */
export { useAuth } from '@/providers/auth-provider'
