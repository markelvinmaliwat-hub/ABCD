PLDT DASHBOARD -> GOOGLE SHEET  (setup, ~4 minutes)
===================================================

How it works now
  READ  : the dashboard reads the logs straight from your Sheet's CSV link
          https://docs.google.com/spreadsheets/d/11-VVgEX5ugFP4suckiaV_LitXz2VhuYe3HhDv4rLcdA/gviz/tq?tqx=out:csv&gid=0
          (first tab = activity, tab "Payment_Log" = payments). If that is unreachable it tries the web app.
  WRITE : the dashboard sends each activity / payment to your Apps Script web app, which appends it to the Sheet.
          (A browser cannot write to a Sheet by itself - the web app is required for writing.)

STEP 1 - Share the Sheet (this is the usual cause of "could not reach the shared database")
  Sheet > Share > General access > "Anyone with the link" > Viewer.
  Test: open the CSV link above in a browser. You should see the Time,Email,Agent Code... header
  (or a download of it). If you see a Google sign-in page, the Sheet is still private.

STEP 2 - Install the backend
  1. In the Sheet: Extensions > Apps Script. Delete everything, paste ALL of apps-script/Code.gs, Save.
  2. Select function "setup" > Run > approve permissions. This puts the headers in the first tab (gid=0)
     and creates the "Payment_Log" tab. (The first tab must be empty - it becomes the activity log.)
  3. Deploy > Manage deployments > pencil on your existing Web app > Version: "New version" > Deploy.
     Execute as = Me, Who has access = Anyone. The /exec URL stays the same.
  4. Open the /exec URL in a browser: you should see {"ok":true,"status":"Dashboard backend is running"}.

STEP 3 - Host the dashboard
  Upload index.html to your own hosting (or open it from your computer).
  It will NOT reach your Sheet if it is opened inside a Claude artifact / preview, because those block
  connections to other sites. That also produces "could not reach the shared database".

IMPORTANT
  * If you ran my earlier script and it created an "Accounts" tab, DELETE that tab now.
    Accounts are now stored privately inside the script, not in the Sheet, so the Sheet can be public-read.
  * With the Sheet public-read, anyone who has the link can read the activity and payment tabs
    (agent emails, searches, remarks). Only share the link with your team.
  * If the dashboard still shows "could not reach ...", the message now ends with the reason in brackets
    (e.g. 'sheet is not shared', 'Payment_Log tab not found', 'web app: Failed to fetch'). Send me that text.
  * Accounts made earlier in an agent's own browser are copied to the server the first time that agent logs in again.
