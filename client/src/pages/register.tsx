import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { registerSchema, phoneLoginRequestSchema, type RegisterInput, type PhoneLoginRequest } from "@shared/schema";
import { Loader2, Eye, EyeOff, Check, Mail, Phone, Smartphone } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import logoImage from "@assets/F66C5CC9-75FA-449A-AAF8-3CBF0FAC2486_1764749832622.png";
import { z } from "zod";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (element: HTMLElement | null, options: { theme: string; size: string; width: number; text: string }) => void;
        };
      };
    };
  }
}

const phoneRegisterSchema = phoneLoginRequestSchema.extend({
  name: z.string().min(2, "Name must be at least 2 characters"),
  businessName: z.string().min(2, "Business name must be at least 2 characters"),
});
type PhoneRegisterInput = z.infer<typeof phoneRegisterSchema>;

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const { register, requestPhoneOtp, verifyPhoneOtp, loginWithGoogle } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [phoneStep, setPhoneStep] = useState<"details" | "otp">("details");
  const [phoneData, setPhoneData] = useState({ phone: "", name: "", businessName: "" });
  const [otpCode, setOtpCode] = useState("");
  const [otpCountdown, setOtpCountdown] = useState(0);

  const emailForm = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      name: "",
      businessName: "",
      businessType: "retail",
    },
  });

  const phoneForm = useForm<PhoneRegisterInput>({
    resolver: zodResolver(phoneRegisterSchema),
    defaultValues: {
      phone: "",
      name: "",
      businessName: "",
    },
  });

  useEffect(() => {
    if (otpCountdown > 0) {
      const timer = setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpCountdown]);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    script.onload = () => {
      const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (window.google && googleClientId) {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleResponse,
        });
        window.google.accounts.id.renderButton(
          document.getElementById("google-signup-button"),
          { theme: "outline", size: "large", width: 320, text: "signup_with" }
        );
      }
    };

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleGoogleResponse = async (response: { credential: string }) => {
    setIsLoading(true);
    try {
      const result = await loginWithGoogle(response.credential);
      if (result.success) {
        toast({
          title: "Account created!",
          description: "Welcome to Apex Mart Wholesale. Your 14-day trial has started.",
        });
        setTimeout(() => {
          setLocation("/dashboard");
        }, 100);
      } else {
        toast({
          title: "Sign up failed",
          description: result.error || "Google authentication failed",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onEmailSubmit = async (data: RegisterInput) => {
    setIsLoading(true);
    try {
      const result = await register(data);
      if (result.success) {
        toast({
          title: "Account created!",
          description: "Welcome to Apex Mart Wholesale. Your 14-day trial has started.",
        });
        setTimeout(() => {
          setLocation("/dashboard");
        }, 100);
      } else {
        toast({
          title: "Registration failed",
          description: result.error || "Could not create account",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onPhoneSubmit = async (data: PhoneRegisterInput) => {
    setIsLoading(true);
    try {
      const result = await requestPhoneOtp(data.phone);
      if (result.success) {
        setPhoneData({ phone: data.phone, name: data.name, businessName: data.businessName });
        setPhoneStep("otp");
        setOtpCountdown(60);
        toast({
          title: "Code sent!",
          description: `A verification code has been sent to ${data.phone}`,
        });
      } else {
        toast({
          title: "Failed to send code",
          description: result.error || "Could not send verification code",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onOtpVerify = async () => {
    if (otpCode.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Please enter the 6-digit code",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await verifyPhoneOtp(
        phoneData.phone, 
        otpCode, 
        phoneData.name, 
        phoneData.businessName
      );
      if (result.success) {
        toast({
          title: "Account created!",
          description: "Welcome to Apex Mart Wholesale. Your 14-day trial has started.",
        });
        setTimeout(() => {
          setLocation("/dashboard");
        }, 100);
      } else {
        toast({
          title: "Verification failed",
          description: result.error || "Invalid or expired code",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resendOtp = async () => {
    if (otpCountdown > 0) return;
    setIsLoading(true);
    try {
      const result = await requestPhoneOtp(phoneData.phone);
      if (result.success) {
        setOtpCountdown(60);
        setOtpCode("");
        toast({
          title: "Code resent!",
          description: "A new verification code has been sent.",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const password = emailForm.watch("password");
  const passwordRequirements = [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "Contains a number", met: /\d/.test(password) },
    { label: "Contains uppercase", met: /[A-Z]/.test(password) },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted/30">
      <header className="flex items-center justify-between p-4 md:p-6">
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer" data-testid="link-logo">
            <img src={logoImage} alt="Apex Mart Wholesale" className="h-9 w-9 rounded-md object-cover" />
            <span className="text-xl font-bold">Apex Mart Wholesale</span>
          </div>
        </Link>
        <ThemeToggle />
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-1">
            <CardTitle className="text-2xl font-bold">Create your account</CardTitle>
            <CardDescription>
              Start your 14-day free trial. No credit card required.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div id="google-signup-button" className="flex justify-center" data-testid="button-google-signup" />

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            <Tabs defaultValue="email" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="email" className="flex items-center gap-2" data-testid="tab-email">
                  <Mail className="h-4 w-4" />
                  Email
                </TabsTrigger>
                <TabsTrigger value="phone" className="flex items-center gap-2" data-testid="tab-phone">
                  <Phone className="h-4 w-4" />
                  Phone
                </TabsTrigger>
              </TabsList>

              <TabsContent value="email" className="mt-4">
                <Form {...emailForm}>
                  <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
                    <FormField
                      control={emailForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="John Doe"
                              data-testid="input-name"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={emailForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="you@example.com"
                              data-testid="input-email"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={emailForm.control}
                      name="businessName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Business Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Your Store Name"
                              data-testid="input-business-name"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={emailForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="Create a strong password"
                                data-testid="input-password"
                                {...field}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                onClick={() => setShowPassword(!showPassword)}
                                data-testid="button-toggle-password"
                              >
                                {showPassword ? (
                                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                          {password.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {passwordRequirements.map((req) => (
                                <div
                                  key={req.label}
                                  className={`flex items-center gap-2 text-xs ${
                                    req.met ? "text-chart-2" : "text-muted-foreground"
                                  }`}
                                >
                                  <Check className={`h-3 w-3 ${req.met ? "opacity-100" : "opacity-30"}`} />
                                  <span>{req.label}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isLoading}
                      data-testid="button-register"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        "Start Free Trial"
                      )}
                    </Button>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="phone" className="mt-4">
                {phoneStep === "details" ? (
                  <Form {...phoneForm}>
                    <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-4">
                      <FormField
                        control={phoneForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Full Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="John Doe"
                                data-testid="input-phone-name"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={phoneForm.control}
                        name="businessName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Business Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Your Store Name"
                                data-testid="input-phone-business-name"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={phoneForm.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone Number</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  type="tel"
                                  placeholder="+1 (555) 123-4567"
                                  className="pl-10"
                                  data-testid="input-phone"
                                  {...field}
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={isLoading}
                        data-testid="button-send-otp"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending code...
                          </>
                        ) : (
                          "Send Verification Code"
                        )}
                      </Button>
                    </form>
                  </Form>
                ) : (
                  <div className="space-y-4">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-4">
                        Enter the 6-digit code sent to <strong>{phoneData.phone}</strong>
                      </p>
                      <div className="flex justify-center mb-4">
                        <InputOTP
                          maxLength={6}
                          value={otpCode}
                          onChange={setOtpCode}
                          data-testid="input-otp"
                        >
                          <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                            <InputOTPSlot index={3} />
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                          </InputOTPGroup>
                        </InputOTP>
                      </div>
                    </div>
                    <Button
                      onClick={onOtpVerify}
                      className="w-full"
                      disabled={isLoading || otpCode.length !== 6}
                      data-testid="button-verify-otp"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        "Verify & Create Account"
                      )}
                    </Button>
                    <div className="flex items-center justify-between text-sm">
                      <Button
                        variant="link"
                        className="p-0 h-auto"
                        onClick={() => setPhoneStep("details")}
                        data-testid="button-change-details"
                      >
                        Change details
                      </Button>
                      <Button
                        variant="link"
                        className="p-0 h-auto"
                        onClick={resendOtp}
                        disabled={otpCountdown > 0 || isLoading}
                        data-testid="button-resend-otp"
                      >
                        {otpCountdown > 0 ? `Resend in ${otpCountdown}s` : "Resend code"}
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <p className="text-xs text-center text-muted-foreground">
              By signing up, you agree to our{" "}
              <a href="#" className="text-primary hover:underline">Terms of Service</a> and{" "}
              <a href="#" className="text-primary hover:underline">Privacy Policy</a>
            </p>
            <div className="text-center text-sm">
              <span className="text-muted-foreground">Already have an account? </span>
              <Link href="/login">
                <span className="text-primary font-medium hover:underline cursor-pointer" data-testid="link-login">
                  Sign in
                </span>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
