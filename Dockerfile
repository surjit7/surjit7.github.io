FROM jekyll/jekyll:4.4.1

WORKDIR /srv/jekyll

COPY Gemfile Gemfile.lock ./
RUN bundle install

COPY . .

EXPOSE 4000
CMD ["jekyll", "serve", "--host", "0.0.0.0"]