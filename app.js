var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cors = require('cors');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var authRouter = require('./routes/authRoutes/authRoutes');
var categoryRouter = require('./routes/categoryRoutes/categoryRoutes');
var assetRouter = require('./routes/assetRoutes/assetRoutes');
var serviceRouter = require('./routes/serviceRoutes/serviceRoutes');
var cartRouter = require('./routes/cartRoutes/cartRoutes');
var bookingRouter = require('./routes/bookingRoutes/bookingRoutes');
var notificationRouter = require('./routes/notificationRoutes/notificationRoutes');
var paymentRouter = require('./routes/paymentRoutes/paymentRoutes');
var feedbackRouter = require('./routes/feedbackRoutes/feedbackRoutes');
var dashboardRouter = require('./routes/dashboardRoutes/dashboardRoutes');


var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use("/uploads", express.static(path.join(__dirname, "uploads")));


app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// atur CORS
app.use(cors({
  origin: "http://localhost:3001", // frontend URL
  credentials: true, // kalau pakai cookie/session
}));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/auth', authRouter)
app.use('/categories', categoryRouter);
app.use('/assets', assetRouter);
app.use('/services', serviceRouter);
app.use('/cart', cartRouter);
app.use('/bookings', bookingRouter);
app.use('/notifications', notificationRouter);
app.use('/payments', paymentRouter);
app.use('/feedbacks', feedbackRouter);
app.use('/dashboard', dashboardRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
