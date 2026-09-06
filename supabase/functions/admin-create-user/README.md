# Admin Create User Function

This Supabase Edge Function allows administrators to create new users securely.
It uses the `SUPABASE_SERVICE_ROLE_KEY` to call `supabase.auth.admin.createUser()` which bypasses the standard client-side signup flow. 
This prevents the current admin from being logged out when a new user is created.

## Deployment

1. **Deploy the function to Supabase:**

   Ensure you have the Supabase CLI installed and are logged in (`supabase login`).
   Link your project if you haven't already (`supabase link --project-ref <your-project-ref>`).

   ```bash
   supabase functions deploy admin-create-user
   ```

2. **Set the required secret (Service Role Key):**

   This function requires the `SUPABASE_SERVICE_ROLE_KEY` to interact with the Supabase Admin API.
   *Do NOT commit this key into your repository.*

   Set it securely via the Supabase CLI:

   ```bash
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_actual_service_role_key
   ```
   
   *(You can find your service_role_key in the Supabase Dashboard: Settings > API)*

3. **Client Configuration:**
   Your application will automatically call this function via `supabase.functions.invoke('admin-create-user', ...)` in `src/api/users.ts`.
