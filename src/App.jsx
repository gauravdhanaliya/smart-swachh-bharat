import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import RequireRole from "./components/RequireRole";
import Splash from "./pages/Splash";
import ChooseRole from "./pages/ChooseRole";
import MobileNumber from "./pages/MobileNumber";
import OtpVerification from "./pages/OtpVerification";
import Success from "./pages/Success";
import CitizenHome from "./pages/CitizenHome";
import MapScreen from "./pages/MapScreen";
import BinDetails from "./pages/BinDetails";
import ToiletDetails from "./pages/ToiletDetails";
import ReportIssue from "./pages/ReportIssue";
import MyComplaints from "./pages/MyComplaints";
import ComplaintTracking from "./pages/ComplaintTracking";
import Profile from "./pages/Profile";
import CitizenNotifications from "./pages/CitizenNotifications";
import CitizenHelp from "./pages/CitizenHelp";
import CitizenEcoGuide from "./pages/CitizenEcoGuide";
import GovDashboard from "./pages/government/GovDashboard";
import GovComplaints from "./pages/government/GovComplaints";
import GovComplaintDetails from "./pages/government/GovComplaintDetails";
import GovBins from "./pages/government/GovBins";
import GovToilets from "./pages/government/GovToilets";
import GovAddFacility from "./pages/government/GovAddFacility";
import GovFacilityRequests from "./pages/government/GovFacilityRequests";
import GovWorkers from "./pages/government/GovWorkers";
import GovAnalytics from "./pages/government/GovAnalytics";
import GovNotifications from "./pages/government/GovNotifications";
import GovProfile from "./pages/government/GovProfile";
import WorkerDashboard from "./pages/worker/WorkerDashboard";
import WorkerTasks from "./pages/worker/WorkerTasks";
import WorkerTaskDetails from "./pages/worker/WorkerTaskDetails";
import WorkerMap from "./pages/worker/WorkerMap";
import WorkerNotifications from "./pages/worker/WorkerNotifications";
import WorkerProfile from "./pages/worker/WorkerProfile";
import WorkerRequestFacility from "./pages/worker/WorkerRequestFacility";
import WorkerFacilityRequests from "./pages/worker/WorkerFacilityRequests";
import WorkerFacilityRequestDetails from "./pages/worker/WorkerFacilityRequestDetails";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/login" element={<ChooseRole />} />
        <Route path="/mobile" element={<MobileNumber />} />
        <Route path="/otp" element={<OtpVerification />} />
        <Route path="/success" element={<Success />} />

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
    </AuthProvider>
  );
}
