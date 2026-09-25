import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "../layouts/AppLayout";
import { Dashboard } from "../pages/Dashboard";
import { Endpoints } from "../pages/Endpoints";
import { EndpointNew } from "../pages/EndpointNew";
import { EndpointDetails } from "../pages/EndpointDetails";
import { Import } from "../pages/Import";
import { Reports } from "../pages/Reports";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "endpoints", element: <Endpoints /> },
      { path: "endpoints/new", element: <EndpointNew /> },
      { path: "endpoints/:id", element: <EndpointDetails /> },
      { path: "import", element: <Import /> },
      { path: "reports", element: <Reports /> },
    ],
  },
]);
