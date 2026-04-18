import axios from "axios";

const baseURL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:5000";

export const apiClient = axios.create({
  baseURL,
  timeout: 8000
});
