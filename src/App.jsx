import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import RequireRole from "./components/RequireRole";
import Splash from "./pages/Splash";
import ChooseRole from "./pages/ChooseRole";

// Each page loads on first visit, so the login screen does not download every dashboard.
const ProfileSetup = lazy(() => import("./pages/ProfileSetup"));
const CitizenHome = lazy(() => import("./pages/CitizenHome"));
const MapScreen = lazy(() => import("./pages/MapScreen"));
const BinDetails = lazy(() => import("./pages/BinDetails"));
const ToiletDetails = lazy(() => import("./pages/ToiletDetails"));
const ReportIssue = lazy(() => import("./pages/ReportIssue"));
const MyComplaints = lazy(() => import("./pages/MyComplaints"));
const ComplaintTracking = lazy(() => import("./pages/ComplaintTracking"));
const Profile = lazy(() => import("./pages/Profile"));
const CitizenNotifications = lazy(() => import("./pages/CitizenNotifications"));
const CitizenHelp = lazy(() => import("./pages/CitizenHelp"));
const CitizenEcoGuide = lazy(() => import("./pages/CitizenEcoGuide"));
const GovDashboard = lazy(() => import("./pages/government/GovDashboard"));
const GovComplaints = lazy(() => import("./pages/government/GovComplaints"));
const GovComplaintDetails = lazy(() => import("./pages/government/GovComplaintDetails"));
const GovBins = lazy(() => import("./pages/government/GovBins"));
const GovToilets = lazy(() => import("./pages/government/GovToilets"));
const GovAddFacility = lazy(() => import("./pages/government/GovAddFacility"));
const GovLocations = lazy(() => import("./pages/government/GovLocations"));
const GovFacilityRequests = lazy(() => import("./pages/government/GovFacilityRequests"));
const GovWorkers = lazy(() => import("./pages/government/GovWorkers"));
const GovAnalytics = lazy(() => import("./pages/government/GovAnalytics"));
const GovNotifications = lazy(() => import("./pages/government/GovNotifications"));
const GovProfile = lazy(() => import("./pages/government/GovProfile"));
const WorkerDashboard = lazy(() => import("./pages/worker/WorkerDashboard"));
const WorkerTasks = lazy(() => import("./pages/worker/WorkerTasks"));
const WorkerTaskDetails = lazy(() => import("./pages/worker/WorkerTaskDetails"));
const WorkerMap = lazy(() => import("./pages/worker/WorkerMap"));
const WorkerNotifications = lazy(() => import("./pages/worker/WorkerNotifications"));
const WorkerProfile = lazy(() => import("./pages/worker/WorkerProfile"));
const WorkerRequestFacility = lazy(() => import("./pages/worker/WorkerRequestFacility"));
const WorkerFacilityRequests = lazy(() => import("./pages/worker/WorkerFacilityRequests"));
const WorkerFacilityRequestDetails = lazy(() => import("./pages/worker/WorkerFacilityRequestDetails"));

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Splash />} />
          <Route path="/login" element={<ChooseRole />} />
          <Route path="/profile/setup" element={<ProfileSetup />} />

          {/* Step 2 — Citizen dashboard & live bin/toilet map */}
          <Route
            path="/citizen"
            element={
              <RequireRole role="citizen">
                <CitizenHome />
              </RequireRole>
            }
          />
          <Route
            path="/citizen/map"
            element={
              <RequireRole role="citizen">
                <MapScreen />
              </RequireRole>
            }
          />
          <Route
            path="/citizen/bin/:id"
            element={
              <RequireRole role="citizen">
                <BinDetails />
              </RequireRole>
            }
          />
          <Route
            path="/citizen/toilet/:id"
            element={
              <RequireRole role="citizen">
                <ToiletDetails />
              </RequireRole>
            }
          />

          {/* Step 3 — end-to-end complaint workflow */}
          <Route
            path="/citizen/report"
            element={
              <RequireRole role="citizen">
                <ReportIssue />
              </RequireRole>
            }
          />
          <Route
            path="/citizen/complaints"
            element={
              <RequireRole role="citizen">
                <MyComplaints />
              </RequireRole>
            }
          />
          <Route
            path="/citizen/complaints/:id"
            element={
              <RequireRole role="citizen">
                <ComplaintTracking />
              </RequireRole>
            }
          />
          <Route
            path="/citizen/notifications"
            element={
              <RequireRole role="citizen">
                <CitizenNotifications />
              </RequireRole>
            }
          />
          <Route
            path="/citizen/help"
            element={
              <RequireRole role="citizen">
                <CitizenHelp />
              </RequireRole>
            }
          />
          <Route
            path="/citizen/eco-guide"
            element={
              <RequireRole role="citizen">
                <CitizenEcoGuide />
              </RequireRole>
            }
          />
          <Route
            path="/citizen/profile"
            element={
              <RequireRole role="citizen">
                <Profile />
              </RequireRole>
            }
          />

          {/* Step 5 — Government Official dashboard */}
          <Route
            path="/official"
            element={
              <RequireRole role="official">
                <GovDashboard />
              </RequireRole>
            }
          />
          <Route
            path="/official/complaints"
            element={
              <RequireRole role="official">
                <GovComplaints />
              </RequireRole>
            }
          />
          <Route
            path="/official/complaints/:id"
            element={
              <RequireRole role="official">
                <GovComplaintDetails />
              </RequireRole>
            }
          />
          <Route
            path="/official/bins"
            element={
              <RequireRole role="official">
                <GovBins />
              </RequireRole>
            }
          />
          <Route
            path="/official/toilets"
            element={
              <RequireRole role="official">
                <GovToilets />
              </RequireRole>
            }
          />
          <Route
            path="/official/locations"
            element={
              <RequireRole role="official">
                <GovLocations />
              </RequireRole>
            }
          />
          <Route
            path="/official/add-facility"
            element={
              <RequireRole role="official">
                <GovAddFacility />
              </RequireRole>
            }
          />
          <Route
            path="/official/facility-requests"
            element={
              <RequireRole role="official">
                <GovFacilityRequests />
              </RequireRole>
            }
          />
          <Route
            path="/official/workers"
            element={
              <RequireRole role="official">
                <GovWorkers />
              </RequireRole>
            }
          />
          <Route
            path="/official/analytics"
            element={
              <RequireRole role="official">
                <GovAnalytics />
              </RequireRole>
            }
          />
          <Route
            path="/official/notifications"
            element={
              <RequireRole role="official">
                <GovNotifications />
              </RequireRole>
            }
          />
          <Route
            path="/official/profile"
            element={
              <RequireRole role="official">
                <GovProfile />
              </RequireRole>
            }
          />

          {/* Step 6 — Worker dashboard & field operations */}
          <Route
            path="/worker"
            element={
              <RequireRole role="worker">
                <WorkerDashboard />
              </RequireRole>
            }
          />
          <Route
            path="/worker/tasks"
            element={
              <RequireRole role="worker">
                <WorkerTasks />
              </RequireRole>
            }
          />
          <Route
            path="/worker/tasks/:id"
            element={
              <RequireRole role="worker">
                <WorkerTaskDetails />
              </RequireRole>
            }
          />
          <Route
            path="/worker/map"
            element={
              <RequireRole role="worker">
                <WorkerMap />
              </RequireRole>
            }
          />
          <Route
            path="/worker/notifications"
            element={
              <RequireRole role="worker">
                <WorkerNotifications />
              </RequireRole>
            }
          />
          <Route
            path="/worker/profile"
            element={
              <RequireRole role="worker">
                <WorkerProfile />
              </RequireRole>
            }
          />

          {/* Step 14A — Worker facility (dustbin/toilet) requests */}
          <Route
            path="/worker/facility-request"
            element={
              <RequireRole role="worker">
                <WorkerRequestFacility />
              </RequireRole>
            }
          />
          <Route
            path="/worker/facility-requests"
            element={
              <RequireRole role="worker">
                <WorkerFacilityRequests />
              </RequireRole>
            }
          />
          <Route
            path="/worker/facility-requests/:id"
            element={
              <RequireRole role="worker">
                <WorkerFacilityRequestDetails />
              </RequireRole>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
