'use client'

import { useEffect } from 'react'
// The user's session lives in the legacy client (storageKey: 'loyalty-auth').
// createBrowserClient (supabase-browser.ts) uses a different storage key and has
// no session on its own. We bridge them here: read from the legacy client,
// set on the SSR browser client, which writes the auth cookies the server needs.
import { supabase as legacyClient } from '@/lib/supabase'
import { supabase as ssrClient } from '@/lib/supabase-browser'

export default function SupabaseSessionSync() {
  useEffect(() => {
    const bridge = async () => {
      const { data: { session } } = await legacyClient.auth.getSession()
      if (session) {
        await ssrClient.auth.setSession({
          access_token:  session.access_token,
          refresh_token: session.refresh_token,
        })
      }
    }

    bridge()

    const { data: { subscription } } = legacyClient.auth.onAuthStateChange((_event, session) => {
      if (session) {
        ssrClient.auth.setSession({
          access_token:  session.access_token,
          refresh_token: session.refresh_token,
        })
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return null
}
