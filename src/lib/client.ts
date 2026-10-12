import axios from 'axios'

/** Best error message from an axios failure. */
export const errorText = (err: unknown, fallback: string) =>
  axios.isAxiosError(err) ? err.response?.data?.error || fallback : fallback